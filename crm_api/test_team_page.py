"""Staff > Team comes a page at a time from the server, with the team's totals."""
from datetime import date, datetime, timezone

from django.contrib.auth.models import User
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.design_studio.models import Designer
from apps.staff.models import AttendanceSession, DayMark, StaffProfile
from crm_api.models import Customer, Order, OrderStage, Tailor

URL = '/api/tailors/team/'
TODAY = date(2026, 3, 10)


class TeamPageTests(TenantTestCase):

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.owner_email = 'owner@team-page.test'
        tenant.name = 'Team Page Atelier'
        return tenant

    def setUp(self):
        super().setUp()
        connection.set_tenant(self.tenant)
        self.owner = User.objects.create_user(
            username='owner@team-page.test', email='owner@team-page.test', password='pass12345')
        self.people = [
            Tailor.objects.create(name=f'Person {n:02d}', specialty='Blouses', role='Tailor')
            for n in range(25)
        ]
        self.master = Tailor.objects.create(name='Mira Master', specialty='All', role='Master')
        self.designers = [
            Designer.objects.create(name=f'Designer {n}', email=f'd{n}@team-page.test', phone=f'90000000{n:02d}')
            for n in range(3)
        ]

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Token {token.key}', HTTP_X_TENANT_ID=self.tenant.schema_name)
        return api

    def get(self, user=None, **params):
        params.setdefault('date', TODAY.isoformat())
        response = self.client_for(user or self.owner).get(URL, params)
        connection.set_tenant(self.tenant)
        return response

    def ok(self, **params):
        response = self.get(**params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def names(self, body):
        return [row['name'] for row in body['results']]

    def give_open_step(self, tailor):
        customer = Customer.objects.create(
            first_name='Busy', last_name='Customer', mobile_number=f'96{tailor.pk:08d}',
            customer_type='Women', garment_type='Blouse', occasion='Wedding')
        order = Order.objects.create(order_id=f'T2B-TP-{tailor.pk}', customer=customer)
        OrderStage.objects.create(
            order=order, stage_key=f'step{tailor.pk}', stage_name='Stitching', sequence=1,
            assigned_to=tailor, status='IN_PROGRESS')

    def test_one_page_with_the_whole_teams_size(self):
        body = self.ok(page=1, page_size=20)
        self.assertEqual(len(body['results']), 20)
        self.assertEqual((body['count'], body['pages'], body['page'], body['page_size']), (29, 2, 1, 20))
        self.assertEqual(body['summary']['total'], 29)
        self.assertEqual(body['summary']['people'], 26)
        self.assertEqual(body['summary']['designers'], 3)

    def test_the_designers_carry_on_after_the_roster_with_no_row_lost_or_repeated(self):
        seen = []
        for page in (1, 2, 3):
            seen += self.ok(page=page, page_size=10)['results']
        self.assertEqual(len(seen), 29)
        self.assertEqual(len({(row['is_designer'], row['id']) for row in seen}), 29)
        self.assertEqual([row['is_designer'] for row in seen], [False] * 26 + [True] * 3)
        self.assertEqual(seen[-1]['name'], 'Designer 2')

    def test_a_page_past_the_end_or_nonsense_is_a_controlled_answer(self):
        self.assertEqual(self.ok(page=99, page_size=20)['page'], 2)
        self.assertEqual(self.ok(page='abc', page_size='xyz')['page'], 1)
        self.assertEqual(self.ok(page_size=100000)['page_size'], 100)
        self.assertEqual(self.ok(page_size=0)['page_size'], 1)
        self.assertEqual(self.ok(date='not-a-date')['count'], 29)

    def test_search_covers_the_whole_team_not_just_this_page(self):
        body = self.ok(search='Person 24', page_size=20)
        self.assertEqual(self.names(body), ['Person 24'])
        self.assertEqual(body['summary']['total'], 29)
        self.assertEqual(body['counts']['scoped'], 1)
        self.assertEqual(self.ok(search='master')['count'], 1)
        self.assertEqual(self.ok(search='designer')['count'], 3)
        self.assertEqual(self.ok(search='nobody-called-this')['count'], 0)

    def test_search_finds_a_phone(self):
        profile = StaffProfile.objects.create(staff=self.people[3], phone='9812345678')
        self.assertEqual(profile.staff_id, self.people[3].pk)
        self.assertEqual(self.names(self.ok(search='9812345678')), ['Person 03'])
        self.assertEqual(self.names(self.ok(search='9000000001')), ['Designer 1'])

    def test_only_designers_and_no_designers(self):
        self.assertEqual(self.ok(only_designers='1')['count'], 3)
        body = self.ok(designers='0', page_size=50)
        self.assertEqual(body['count'], 26)
        self.assertEqual(body['summary']['total'], 26)

    def test_the_available_card_counts_the_whole_team_and_narrows_the_list(self):
        self.give_open_step(self.people[0])
        body = self.ok(card='available', page_size=50)
        self.assertEqual(body['count'], 25)
        self.assertNotIn('Person 00', self.names(body))
        self.assertFalse(any(row['is_designer'] for row in body['results']))
        self.assertEqual(body['summary']['busy'], 1)
        self.assertEqual(body['summary']['available'], 25)
        self.assertEqual(body['counts']['busy'], 1)

    def test_the_pay_card_includes_a_designers_terms(self):
        StaffProfile.objects.create(staff=self.people[0])
        StaffProfile.objects.create(designer=self.designers[0])
        body = self.ok(card='pay')
        self.assertEqual(sorted(self.names(body)), ['Designer 0', 'Person 00'])
        self.assertEqual(self.ok()['counts']['with_terms'], 2)

    def test_the_present_card_and_the_attendance_badges(self):
        here = datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc)
        gone = datetime(2026, 3, 10, 17, 0, tzinfo=timezone.utc)
        AttendanceSession.objects.create(staff=self.people[0], date=TODAY, check_in=here)
        AttendanceSession.objects.create(staff=self.people[1], date=TODAY, check_in=here, check_out=gone)
        DayMark.objects.create(staff=self.people[2], date=TODAY, kind=DayMark.Kind.LEAVE)
        DayMark.objects.create(staff=self.people[3], date=TODAY, kind='WEEKLY_OFF')
        body = self.ok(card='present')
        self.assertEqual(sorted(self.names(body)), ['Person 00', 'Person 01'])
        counts = self.ok()['counts']
        self.assertEqual((counts['present'], counts['out'], counts['leave'], counts['off']), (1, 1, 1, 1))
        other_day = self.ok(date='2026-03-11')['counts']
        self.assertEqual(other_day['present'], 0)

    def test_a_master_gets_the_team_without_the_designers(self):
        user = User.objects.create_user(username='mira', email='mira@team-page.test', password='pass12345')
        self.master.user = user
        self.master.save()
        response = self.get(user, page_size=50)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 26)
        self.assertEqual(response.data['summary']['designers'], 0)
        self.assertFalse(any(row['is_designer'] for row in response.data['results']))

    def test_a_tailor_cannot_read_the_team(self):
        user = User.objects.create_user(username='tina', email='tina@team-page.test', password='pass12345')
        self.people[0].user = user
        self.people[0].save()
        self.assertEqual(self.get(user).status_code, 403)

    def test_a_designers_attendance_row_is_not_a_second_team_member(self):
        row = Tailor.objects.create(name='Designer 0', specialty='Design', role='Designer')
        self.designers[0].staff = row
        self.designers[0].save()
        body = self.ok(search='Designer 0')
        self.assertEqual(body['count'], 1)
        self.assertTrue(body['results'][0]['is_designer'])
        self.assertEqual(self.ok()['summary']['total'], 29)
