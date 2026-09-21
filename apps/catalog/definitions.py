import re

from apps.inventory.models import Category as Inv


def _slug(label):
    return re.sub(r'[^a-z0-9]+', '_', str(label).lower()).strip('_')


def field(key, label, field_type, **kw):

    options = kw.pop('options', None)
    return {
        'key': key,
        'label': label,
        'field_type': field_type,
        'unit': kw.pop('unit', None),
        'is_required': kw.pop('required', False),
        'is_repeatable': kw.pop('repeatable', False),
        'default': kw.pop('default', None),
        'help_text': kw.pop('help_text', None),
        'visible_when': kw.pop('when', None),
        'validation': kw.pop('validation', {}),
        'inventory_category': kw.pop('inventory', None),
        'options': [
            o if isinstance(o, tuple) else (_slug(o), o) for o in (options or [])
        ],
    }


def measurement(key, label, **kw):

    kw.setdefault('validation', {'min': 0, 'max': 120, 'step': 0.25})
    # 'Inches' rather than 'in': the unit is shown verbatim next to the input.
    return field(key, label, 'number', unit='Inches', **kw)


def material(key, label, category, **kw):
    return field(key, label, 'inventory_ref', inventory=category, **kw)


def eq(f, v):
    return {'field': f, 'op': 'eq', 'value': v}


def neq(f, v):
    return {'field': f, 'op': 'neq', 'value': v}


def one_of(f, values):
    return {'field': f, 'op': 'in', 'value': values}


def all_of(*rules):
    return {'all': list(rules)}


def not_one_of(f, values):
    return {'field': f, 'op': 'not_in', 'value': values}



COMMON_BASIC = [
    field('trial_required', 'Trial Required', 'boolean'),
    field('trial_date', 'Trial Date', 'date', when=eq('trial_required', True)),
    field('delivery_date', 'Delivery Date', 'date'),
    field('urgency', 'Urgency', 'select', options=['Normal', 'Express'], default='normal'),
    # No free-text box here: `special_instructions` (production) is the one
    # note box, so the counter is not asked "anything else" twice.
]

# (15) Asked after the numbers on every garment; the voice note lands here too.
COMMON_MEASUREMENTS = [
    field('measurement_notes', 'Notes on the measurements', 'textarea',
          help_text='Fit preferences, posture, anything the numbers do not say.',
          validation={'max_length': 500}),
]

#: Where the cloth comes from. Prepended so it leads the materials section
#: on every garment (COMMON_MATERIALS is appended after the garment's own).
FABRIC_SOURCE = [
    field('fabric_source', 'Fabric', 'select', options=[
        ('inventory', 'From our inventory'),
        ('customer', 'Customer will provide'),
        ('buy', 'Need to buy'),
    ], default='inventory'),
]

COMMON_MATERIALS = [
    material('other_accessories', 'Other Accessories', Inv.OTHER, repeatable=True),
]

COMMON_PRODUCTION = [
    field('special_instructions', 'Special Instructions', 'textarea',
          validation={'max_length': 2000}),
    field('internal_notes', 'Internal Notes', 'textarea',
          help_text='Staff only — never shown on the customer copy.',
          validation={'max_length': 2000}),
    field('customer_notes', 'Customer Notes', 'textarea', validation={'max_length': 2000}),
    field('reference_images', 'Reference Images', 'file', repeatable=True),
    field('measurement_sheet', 'Measurement Sheet', 'file'),
    field('audio_note', 'Audio Note', 'file',
          help_text='Transcribed into the special instructions.'),
    field('final_approved_design', 'Final Approved Design', 'file'),
]



def blouse_measurements():
    return [
        measurement('blouse_length', 'Blouse Length'),
        measurement('shoulder', 'Shoulder'),
        measurement('upper_chest', 'Upper Chest'),
        measurement('chest', 'Chest'),
        measurement('waist', 'Waist'),
        measurement('armhole', 'Armhole'),
    ]


def sleeve_and_neck():
    return [
        field('sleeve_length', 'Sleeve Length', 'select', options=[
            'Sleeveless', 'Cap', 'Short', 'Elbow', ('three_quarter', '3/4'), 'Full']),
        field('hand_rounding', 'Hand Rounding', 'select',
              options=['HR1', 'HR2', 'HR3', 'HR4'],
              when=neq('sleeve_length', 'sleeveless')),
        field('front_neck', 'Front Neck', 'text'),
        field('back_neck', 'Back Neck', 'text'),
        field('collar', 'Collar', 'text'),
    ]


WAIST_FINISH = ['Belt', 'Elastic', 'Button', 'Dori']


def bottom_materials(extra=()):
    return [
        material('fabric', 'Fabric', Inv.FABRIC),
        *extra,
        material('elastic', 'Elastic', Inv.STITCHING, when=one_of('waist_finish', ['elastic'])),
        material('dori', 'Dori', Inv.STITCHING, when=one_of('waist_finish', ['dori'])),
    ]


def grouped(group, *fields, when=None):
    """Fold these optional fields away under one "+ <group>" heading on the
    Measurements step. Read from validation['group'] by the wizard; the
    server ignores keys it does not know, so nothing else changes.
    `when` puts the same visibility rule on every field in the group."""
    for f in fields:
        f['validation'] = {**f['validation'], 'group': group}
        if when is not None:
            f['visible_when'] = when
    return list(fields)


def parts(*labels):
    """The parts of a garment a design photograph can be of.

    Labels in, [{"key": ..., "label": ...}] out, slugged the same way option
    values are so the two vocabularies cannot drift apart. Order is the order
    the upload form shows them in, so the overall shot comes first.
    """
    seen, out = set(), []
    for label in labels:
        key = _slug(label)
        if key in seen:      # a list written by hand repeats itself eventually
            continue
        seen.add(key)
        out.append({'key': key, 'label': label})
    return out


# --- the garments ----------------------------------------------------------

TEMPLATES = [
    {
        'key': 'saree', 'name': 'Saree', 'sequence': 10,
        'design_parts': parts('Overall Saree Design', 'Pallu Design', 'Border Design',
              'Body Design', 'Pleat Design', 'Print Design', 'Embroidery Design',
              'Zari / Work Design'),
        'sections': {
            'basic': [
                field('saree_type', 'Saree Type', 'select', required=True, options=[
                    'Silk', 'Cotton', 'Georgette', 'Chiffon', 'Linen', 'Organza',
                    'Tissue', 'Banarasi', 'Kanchipuram', 'Other']),
                field('saree_type_other', 'Specify Type', 'text', required=True,
                      when=eq('saree_type', 'other')),
                field('fabric_length', 'Fabric Length', 'number', unit='m',
                      validation={'min': 0, 'max': 20, 'step': 0.25}),
            ],
            # A petticoat is its own garment on the order (key 'petticoat'),
            # so the saree no longer asks whether one is required.
            # Nothing here is required: every group folds away behind a "+"
            # and is filled only when the counter has the numbers.
            'measurements': [
                *grouped('Body / Fit Measurements',
                    measurement('height', 'Height'),
                    measurement('shoulder', 'Shoulder'),
                    measurement('bust', 'Bust'),
                    measurement('underbust', 'Underbust'),
                    measurement('waist', 'Waist'),
                    measurement('high_waist', 'High Waist'),
                    measurement('hip', 'Hip'),
                    measurement('waist_to_floor', 'Waist-to-Floor'),
                    measurement('shoulder_to_floor', 'Shoulder-to-Floor'),
                    measurement('blouse_length', 'Blouse Length'),
                ),
                *grouped('Saree Measurements',
                    field('saree_total_length', 'Saree Total Length', 'number', unit='m',
                          validation={'min': 0, 'max': 20, 'step': 0.25}),
                    measurement('saree_width', 'Saree Width'),
                    measurement('pallu_length', 'Pallu Length'),
                    measurement('pallu_width', 'Pallu Width'),
                    field('pallu_placement', 'Pallu Fall / Placement', 'text'),
                    measurement('pleat_length', 'Pleat Length'),
                    measurement('pleat_width', 'Pleat Width'),
                    field('number_of_pleats', 'Number of Pleats', 'number',
                          validation={'min': 0, 'max': 30, 'step': 1}),
                    field('saree_fall_length', 'Saree Fall Length', 'number', unit='m',
                          validation={'min': 0, 'max': 20, 'step': 0.25}),
                    measurement('petticoat_length', 'Petticoat Length'),
                    measurement('petticoat_waist', 'Petticoat Waist'),
                    measurement('petticoat_flare', 'Petticoat Flare / Hem',
                                validation={'min': 0, 'max': 200, 'step': 0.25}),
                ),
                # The two groups below are alternatives, keyed on the style
                # step's `border`: with it, the border/pattern numbers; without
                # (or not asked, when no stitching service is chosen), the plain
                # ones. `neq` is the opposite of `eq` and is true when unanswered.
                *grouped('With Border / Pattern',
                    measurement('border_width', 'Border Width'),
                    field('border_placement', 'Border Placement', 'text'),
                    measurement('top_border_width', 'Top Border'),
                    measurement('bottom_border_width', 'Bottom Border'),
                    measurement('pallu_border_width', 'Pallu Border'),
                    field('border_direction', 'Border Direction', 'text'),
                    measurement('pattern_repeat', 'Pattern Repeat'),
                    measurement('motif_size', 'Motif Size'),
                    measurement('motif_spacing', 'Motif Spacing'),
                    field('pattern_align_pleats', 'Pattern Alignment at Pleats', 'text'),
                    field('pattern_align_pallu', 'Pattern Alignment at Pallu', 'text'),
                    field('embroidery_placement', 'Embroidery Placement', 'text'),
                    field('contrast_panel', 'Contrast Panel Measurements', 'text'),
                    when=eq('border', 'with_border')),
                *grouped('Without Pattern',
                    measurement('plain_body_width', 'Plain Body Width'),
                    measurement('plain_pallu_width', 'Plain Pallu Width'),
                    field('plain_border', 'Plain Border / No Border', 'select',
                          options=['Plain Border', 'No Border']),
                    field('edge_finish', 'Desired Finish at Edges', 'text'),
                    field('tassel_placement', 'Tassel / Latkan Placement', 'text'),
                    when=neq('border', 'with_border')),
            ],
            'style': [
                field('services', 'Services Required', 'multiselect', required=True, options=[
                    'Stitching', 'Fall', 'Pico', ('fall_pico', 'Fall + Pico'),
                    'Tassel Work', 'Saree Finishing', ('polishing', 'Polishing / Steam')]),
                field('border', 'Border', 'select', options=[
                    ('with_border', 'With Border'), ('without_border', 'Without Border')],
                      when=one_of('services', ['stitching', 'saree_finishing'])),
                field('border_source', 'Border From', 'select', options=[
                    'From Customer', 'From Inventory'],
                      when=eq('border', 'with_border')),
                field('border_length', 'Border Length', 'number', unit='m',
                      validation={'min': 0, 'max': 20, 'step': 0.25},
                      when=eq('border_source', 'from_customer')),
                field('border_image', 'Border Photo', 'file',
                      when=eq('border_source', 'from_customer')),
                field('backing', 'Backing', 'select', options=[
                    ('with_backing', 'With Backing'), ('without_backing', 'Without Backing')],
                      when=one_of('services', ['stitching', 'saree_finishing'])),
                # `backing` is pruned the moment it hides, so these need only
                # watch it, not the services list behind it.
                field('backing_size', 'Backing Size', 'select', options=[
                    'Small Size', 'Same as Border Size', 'Inches Backing'],
                      when=eq('backing', 'with_backing')),
                field('backing_inches', 'Backing (inches)', 'number', unit='Inches',
                      validation={'min': 0, 'max': 60, 'step': 0.25},
                      when=eq('backing_size', 'inches_backing')),
                field('fall_type', 'Fall', 'select', options=['Big Fall', 'Small Fall'],
                      when=one_of('services', ['fall', 'fall_pico'])),
                field('pico_type', 'Pico', 'select', options=['Standard', 'Premium'],
                      when=one_of('services', ['pico', 'fall_pico'])),
                field('tassels', 'Tassels', 'select', options=[
                    'Hand Made', 'Readymade', 'Knot Style'],
                      when=one_of('services', ['tassel_work'])),
            ],
            'materials': [
                material('fabric_used', 'Fabric Used', Inv.FABRIC),
                material('border_used', 'Border Used', Inv.BORDER,
                         when=eq('border', 'with_border')),
                material('lining', 'Lining', Inv.LINING),
                material('fall_cloth', 'Fall Cloth', Inv.LINING,
                         when=one_of('services', ['fall', 'fall_pico'])),
                material('tassels_material', 'Tassels', Inv.EMBELLISHMENT,
                         when=all_of(one_of('services', ['tassel_work']),
                                     neq('tassels', 'no_tassels'))),
                material('thread_colour', 'Thread Colour', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'blouse', 'name': 'Blouse', 'sequence': 20,
        'design_parts': parts('Overall Blouse Design', 'Front Design', 'Back Design',
              'Neck Design', 'Sleeve Design', 'Hand Design'),
        'sections': {
            'basic': [
                # Lehenga Blouse was retired into this garment, so its styles
                # live here now. Keeping them on `blouse_type` rather than
                # reviving a second `blouse_style` field means one question
                # decides the cut, and the conditional fields below hang off
                # the same answer the counter staff already give.
                field('blouse_type', 'Blouse Type', 'select', required=True, options=[
                    'Plain', 'Princess', 'One-Tuck', 'Three Point', 'Katori',
                    'Portable Katori', 'Peplum', 'Ruffled', ('jacket', 'Jacket Style'),
                    ('cape', 'Cape Style'), 'Long Waist', 'Corset']),
            ],
            # The six shared measurements stay as they were (required, drawn
            # up front). Everything after is optional and folds away behind a
            # "+" per group. Shoulder, waist, armhole, sleeve length, neck and
            # collar already have a field, so they are not asked twice.
            'measurements': [
                *blouse_measurements(),
                *grouped('Body Measurements',
                    measurement('bust', 'Bust'),
                    measurement('underbust', 'Underbust'),
                    measurement('high_waist', 'High Waist'),
                    measurement('across_chest', 'Across Chest'),
                    measurement('across_back', 'Across Back'),
                    measurement('front_length', 'Front Length'),
                    measurement('back_length', 'Back Length'),
                    measurement('upper_arm', 'Upper Arm / Bicep'),
                    measurement('elbow', 'Elbow'),
                    measurement('wrist', 'Wrist'),
                    measurement('neck_circumference', 'Neck Circumference'),
                    measurement('shoulder_to_bust', 'Shoulder-to-Bust'),
                    measurement('shoulder_to_waist', 'Shoulder-to-Waist'),
                ),
                *grouped('Neck',
                    measurement('neck_width', 'Neck Width'),
                    measurement('front_neck_depth', 'Front Neck Depth'),
                    measurement('back_neck_depth', 'Back Neck Depth'),
                    field('neck_shape', 'Neck Shape', 'text'),
                    measurement('collar_height', 'Collar Height (if applicable)'),
                ),
                *grouped('Sleeves',
                    measurement('sleeve_opening', 'Sleeve Opening'),
                    measurement('upper_arm_circumference', 'Upper-Arm Circumference'),
                    measurement('elbow_circumference', 'Elbow Circumference'),
                    measurement('cuff_width', 'Cuff Width'),
                    measurement('cuff_height', 'Cuff Height'),
                ),
                *grouped('Closure',
                    field('closure', 'Closure', 'multiselect', options=[
                        ('back_zip', 'Back Zip'), ('side_zip', 'Side Zip'),
                        'Hooks', 'Dori', 'Buttons']),
                    measurement('opening_length', 'Opening Length'),
                ),
                *grouped('With Pattern / Embroidery',
                    measurement('border_width', 'Border Width'),
                    measurement('sleeve_border', 'Sleeve Border'),
                    measurement('neck_border', 'Neck Border'),
                    measurement('waist_border', 'Waist Border'),
                    measurement('front_motif_size', 'Front Motif Size'),
                    measurement('back_motif_size', 'Back Motif Size'),
                    field('sleeve_motif', 'Sleeve Motif', 'text'),
                    measurement('pattern_repeat', 'Pattern Repeat'),
                    field('pattern_direction', 'Pattern Direction', 'text'),
                    field('embroidery_placement', 'Embroidery Placement', 'text'),
                    field('mirror_panel_matching', 'Mirror / Panel Matching', 'text'),
                ),
                *grouped('Plain Blouse',
                    field('fabric_direction', 'Fabric Direction', 'text'),
                    field('seam_placement', 'Seam Placement', 'text'),
                    field('dart_placement', 'Dart Placement', 'text'),
                    field('princess_cut_placement', 'Princess-Cut Placement', 'text'),
                    measurement('ease_allowance', 'Ease / Comfort Allowance'),
                ),
            ],
            'style': [
                *sleeve_and_neck(),
                field('dot_point', 'Dot Point', 'text'),
                field('padding', 'Padding', 'select',
                      options=[('padded', 'Padded'), ('non_padded', 'Non-Padded')]),
                field('dori_required', 'Dori', 'boolean'),
                field('dori_colour', 'Dori Colour', 'text', when=eq('dori_required', True)),
                field('dori_tassel_type', 'Dori Tassel Type', 'select',
                      options=['Hand Made', 'Readymade', 'Knot'],
                      when=eq('dori_required', True)),
                # Carried over from Lehenga Blouse with the retirement. Each is
                # invisible unless its own cut is chosen, so a Plain blouse asks
                # exactly what it asked before.
                measurement('flare_length', 'Flare Length', when=eq('blouse_type', 'peplum')),
                field('flare_type', 'Flare Type', 'select',
                      options=['A-Line', 'Pleats', 'Box Pleats'],
                      when=eq('blouse_type', 'peplum')),
                field('layer_count', 'Number of Layers', 'number',
                      validation={'min': 1, 'max': 10, 'step': 1},
                      when=eq('blouse_type', 'ruffled')),
                field('collar_style', 'Collar Style', 'text', when=eq('blouse_type', 'jacket')),
                measurement('cape_length', 'Cape Length', when=eq('blouse_type', 'cape')),
                field('cape_neck_shape', 'Cape Neck Shape', 'text',
                      when=eq('blouse_type', 'cape')),
                field('cape_fastening', 'Buttons / Hooks', 'select',
                      options=['Buttons', 'Hooks', 'None'], when=eq('blouse_type', 'cape')),
                field('corset_cups', 'Corset Cups', 'select',
                      options=['Soft', 'Moulded', 'None'], when=eq('blouse_type', 'corset')),
                field('boning_required', 'Boning Required', 'boolean',
                      when=eq('blouse_type', 'corset')),
            ],
            'materials': [
                material('main_fabric', 'Main Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('cups', 'Cups', Inv.EMBELLISHMENT, when=eq('padding', 'padded')),
                material('boning', 'Boning', Inv.EMBELLISHMENT,
                         when=eq('boning_required', True)),
                material('hooks', 'Hooks', Inv.STITCHING),
                material('zip', 'Zip', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'lehenga', 'name': 'Lehenga', 'sequence': 30,
        'design_parts': parts('Overall Lehenga Design', 'Lehenga / Skirt Design', 'Border Design',
              'Waistband Design', 'Embroidery / Work Design', 'Print Design'),
        'sections': {
            'basic': [
                field('lehenga_type', 'Lehenga Type', 'select', required=True, options=[
                    'A-Line', 'Circular', 'Mermaid', 'Straight Cut',
                    ('panelled', 'Panelled (Khalis)')]),
            ],
            # Waist and floor length stay required and up front. The rest is
            # optional, folded behind a "+" per group. Waist-to-floor is
            # `floor_length`, waist fastening is `waist_finish` (style), so
            # neither is asked twice.
            'measurements': [
                measurement('waist', 'Waist', required=True),
                measurement('floor_length', 'Floor Length', required=True),
                *grouped('Body',
                    measurement('height', 'Height'),
                    measurement('high_waist', 'High Waist'),
                    measurement('hip', 'Hip'),
                    measurement('waist_to_hip', 'Waist-to-Hip'),
                    measurement('waist_to_ankle', 'Waist-to-Ankle'),
                    measurement('finished_length', 'Desired Finished Length'),
                    measurement('heel_height', 'Heel Height'),
                ),
                *grouped('Construction',
                    measurement('waistband_width', 'Waistband Width'),
                    field('panel_count', 'Number of Panels / Kalis', 'number',
                          validation={'min': 0, 'max': 60, 'step': 1}),
                    measurement('panel_width', 'Panel Width'),
                    measurement('total_ghera', 'Total Ghera',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    measurement('hem_circumference', 'Hem Circumference',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    measurement('front_length', 'Front Length'),
                    measurement('back_length', 'Back Length'),
                    measurement('seam_allowance', 'Seam Allowance'),
                ),
                *grouped('Layers / Tiers',
                    field('layers', 'Layers / Tiers', 'textarea',
                          help_text='One line per layer: starting point, height, width, flare, gather ratio, fabric, seam placement.',
                          validation={'max_length': 2000}),
                ),
                *grouped('Border',
                    measurement('bottom_border_width', 'Bottom Border Width'),
                    measurement('second_border_width', 'Second Border Width'),
                    field('border_placement', 'Border Placement', 'text'),
                    measurement('border_distance', 'Distance Between Borders'),
                    measurement('border_circumference', 'Border Circumference',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    field('border_direction', 'Border Direction', 'text'),
                ),
                *grouped('Pattern / Embroidery',
                    measurement('motif_size', 'Motif Size'),
                    measurement('motif_spacing', 'Motif Spacing'),
                    measurement('pattern_repeat', 'Pattern Repeat'),
                    field('front_pattern', 'Front Pattern', 'text'),
                    field('back_pattern', 'Back Pattern', 'text'),
                    field('panel_pattern', 'Panel Pattern', 'text'),
                    field('pattern_matching', 'Pattern Matching', 'text'),
                    field('embroidery_placement', 'Embroidery Placement', 'text'),
                    field('sequin_placement', 'Sequins / Beadwork Placement', 'text'),
                ),
                *grouped('Inner',
                    measurement('lining_length', 'Lining Length'),
                    measurement('cancan_length', 'Can-Can Length'),
                    field('cancan_layers', 'Can-Can Layers', 'number',
                          validation={'min': 0, 'max': 10, 'step': 1}),
                    measurement('cancan_flare', 'Can-Can Flare',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    field('petticoat_underskirt', 'Petticoat / Underskirt', 'text'),
                    field('fastening', 'Hooks / Zip / Dori', 'multiselect',
                          options=['Hooks', 'Zip', 'Dori']),
                ),
            ],
            'style': [
                field('waist_finish', 'Waist Finish', 'select',
                      options=['Dori', 'Belt', 'Elastic']),
                field('border', 'Border', 'boolean'),
                field('backing', 'Backing', 'boolean'),
                field('lining_type', 'Lining', 'select',
                      options=['Cotton', 'Crepe', 'Catman']),
            ],
            'materials': [
                material('main_fabric', 'Main Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('can_can', 'Can Can', Inv.LINING),
                material('canvas', 'Canvas', Inv.LINING),
                material('border_material', 'Border', Inv.BORDER, when=eq('border', True)),
                material('zip', 'Zip', Inv.STITCHING),
                material('hooks', 'Hooks', Inv.STITCHING),
            ],
        },
    },
    {
        # Un-retired at the boutique's request. 0007 folded this into `blouse`
        # on the grounds that a lehenga blouse is a blouse; the boutique wants
        # it back as a garment of its own so lehenga blouse photographs are
        # filed apart from saree blouse ones. `blouse_style` rather than
        # `blouse_type` is the key it retired with, so the jobs that still
        # point at this template keep reading.
        'key': 'lehenga_blouse', 'name': 'Lehenga Blouse', 'sequence': 40,
        'design_parts': parts('Overall Blouse Design', 'Front Design', 'Back Design',
              'Neck Design', 'Sleeve Design', 'Hand Design'),
        'sections': {
            'basic': [
                field('blouse_style', 'Style', 'select', required=True, options=[
                    'Standard', 'Peplum', 'Ruffled', ('jacket', 'Jacket Style'),
                    ('cape', 'Cape Style'), 'Long Waist', 'Corset']),
            ],
            'measurements': blouse_measurements(),
            'style': [
                *sleeve_and_neck(),
                field('padding', 'Padding', 'boolean'),
                measurement('flare_length', 'Flare Length', when=eq('blouse_style', 'peplum')),
                field('flare_type', 'Flare Type', 'select',
                      options=['A-Line', 'Pleats', 'Box Pleats'],
                      when=eq('blouse_style', 'peplum')),
                field('layer_count', 'Number of Layers', 'number',
                      validation={'min': 1, 'max': 10, 'step': 1},
                      when=eq('blouse_style', 'ruffled')),
                field('collar_style', 'Collar Style', 'text', when=eq('blouse_style', 'jacket')),
                measurement('cape_length', 'Cape Length', when=eq('blouse_style', 'cape')),
                field('cape_neck_shape', 'Cape Neck Shape', 'text',
                      when=eq('blouse_style', 'cape')),
                field('cape_fastening', 'Buttons / Hooks', 'select',
                      options=['Buttons', 'Hooks', 'None'], when=eq('blouse_style', 'cape')),
                field('corset_cups', 'Corset Cups', 'select',
                      options=['Soft', 'Moulded', 'None'], when=eq('blouse_style', 'corset')),
                field('boning_required', 'Boning Required', 'boolean',
                      when=eq('blouse_style', 'corset')),
            ],
            'materials': [
                material('main_fabric', 'Main Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('cups', 'Cups', Inv.EMBELLISHMENT, when=eq('padding', True)),
                material('boning', 'Boning', Inv.EMBELLISHMENT,
                         when=eq('boning_required', True)),
                material('hooks', 'Hooks', Inv.STITCHING),
                material('zip', 'Zip', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'dupatta', 'name': 'Dupatta', 'sequence': 50,
        'design_parts': parts('Overall Dupatta Design', 'Border Design', 'Pallu / End Design',
              'Body Design', 'Corner Design', 'Print Design',
              'Embroidery / Work Design', 'Tassel / Latkan Design'),
        'sections': {
            'measurements': [
                measurement('length', 'Length', required=True),
                measurement('width', 'Width', required=True),
            ],
            'style': [
                field('border', 'Border', 'boolean'),
                field('backing', 'Backing', 'boolean'),
                field('embroidery_finish', 'Embroidery Finish', 'select',
                      options=['None', 'Machine', 'Hand', 'Maggam']),
            ],
            'materials': [
                material('fabric', 'Fabric', Inv.FABRIC),
                material('border_material', 'Border', Inv.BORDER, when=eq('border', True)),
                material('lace', 'Lace', Inv.BORDER),
                material('thread', 'Thread', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'kurti', 'name': 'Kurti', 'sequence': 60,
        'design_parts': parts('Overall Kurti Design', 'Front Design', 'Back Design', 'Neck Design',
              'Sleeve Design', 'Hemline / Bottom Design', 'Side Design',
              'Embroidery / Work Design', 'Print Design', 'Pocket Design'),
        'sections': {
            'basic': [
                field('kurti_type', 'Kurti Type', 'select', required=True,
                      options=['Plain', 'A-Line', '3 Piece', 'Khalis']),
            ],
            'measurements': [
                measurement('full_length', 'Full Length'),
                measurement('bodice_length', 'Bodice Length'),
                measurement('shoulder', 'Shoulder'),
                measurement('upper_chest', 'Upper Chest'),
                measurement('chest', 'Chest'),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
            ],
            'style': [
                field('front_neck', 'Front Neck', 'text'),
                field('back_neck', 'Back Neck', 'text'),
                field('collar', 'Collar', 'text'),
                field('slit', 'Slit', 'select', options=['Left', 'Right', 'Both', 'None']),
                field('zip_position', 'Zip', 'select',
                      options=['Side', 'Front', 'Back', 'None']),
                field('pocket', 'Pocket', 'boolean'),
                field('padding', 'Padding', 'boolean'),
            ],
            'materials': [
                material('fabric', 'Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('zip', 'Zip', Inv.STITCHING, when=neq('zip_position', 'none')),
                material('buttons', 'Buttons', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'anarkali', 'name': 'Anarkali', 'sequence': 70,
        'design_parts': parts('Overall Anarkali Design', 'Front Design', 'Back Design',
              'Neck Design', 'Sleeve Design', 'Flare / Ghera Design',
              'Border Design', 'Dupatta Design', 'Embroidery Design',
              'Print Design', 'Waist / Belt Design'),
        'sections': {
            'basic': [
                field('anarkali_type', 'Anarkali Type', 'select', required=True,
                      options=['A-Line', 'Khalis']),
                field('bodice', 'Bodice', 'select', options=[
                    ('with_bodice', 'With Bodice'), ('without_bodice', 'Without Bodice')]),
            ],
            'measurements': [
                measurement('top_length', 'Top Length'),
                measurement('bodice_length', 'Bodice Length',
                            when=eq('bodice', 'with_bodice')),
                measurement('shoulder', 'Shoulder'),
                measurement('upper_chest', 'Upper Chest'),
                measurement('chest', 'Chest'),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                # The seven above stay as they were. The rest is optional and
                # folds behind a "+" per group. Shoulder, bust (chest), waist,
                # hip and the finished length (top length) are asked above.
                *grouped('Body',
                    measurement('underbust', 'Underbust'),
                    measurement('high_waist', 'High Waist'),
                    measurement('armhole', 'Armhole'),
                    measurement('upper_arm', 'Upper Arm'),
                    measurement('elbow', 'Elbow'),
                    measurement('wrist', 'Wrist'),
                ),
                *grouped('Length',
                    measurement('shoulder_to_bust', 'Shoulder-to-Bust'),
                    measurement('shoulder_to_waist', 'Shoulder-to-Waist'),
                    measurement('shoulder_to_hip', 'Shoulder-to-Hip'),
                    measurement('shoulder_to_floor', 'Shoulder-to-Floor'),
                    measurement('front_length', 'Front Length'),
                    measurement('back_length', 'Back Length'),
                    measurement('heel_height', 'Heel Height'),
                ),
                *grouped('Construction',
                    field('panel_count', 'Number of Panels / Kalis', 'number',
                          validation={'min': 0, 'max': 60, 'step': 1}),
                    measurement('panel_width', 'Panel Width'),
                    measurement('empire_waist', 'Empire Waist Position'),
                    measurement('flare_ghera', 'Flare / Ghera',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    measurement('hem_circumference', 'Hem Circumference',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    field('panel_seam_placement', 'Panel Seam Placement', 'text'),
                    measurement('lining_length', 'Lining Length'),
                    field('cancan_details', 'Can-Can', 'text'),
                ),
                *grouped('Layers',
                    field('layer_count', 'Layer Count', 'number',
                          validation={'min': 0, 'max': 10, 'step': 1}),
                    measurement('layer_start', 'Layer Starting Point'),
                    measurement('layer_height', 'Layer Height'),
                    measurement('layer_flare', 'Layer Flare',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    field('gather_ratio', 'Gather Ratio', 'text'),
                    field('layer_fabric', 'Layer Fabric', 'text'),
                ),
                *grouped('Border / Pattern',
                    measurement('neck_border', 'Neck Border'),
                    measurement('sleeve_border', 'Sleeve Border'),
                    measurement('waist_border', 'Waist Border'),
                    measurement('panel_border', 'Panel Border'),
                    measurement('bottom_border', 'Bottom Border'),
                    measurement('border_width', 'Border Width'),
                    measurement('motif_size', 'Motif Size'),
                    measurement('motif_spacing', 'Motif Spacing'),
                    measurement('pattern_repeat', 'Pattern Repeat'),
                    field('panel_matching', 'Panel Matching', 'text'),
                    field('front_back_pattern', 'Front / Back Pattern', 'text'),
                    field('embroidery_placement', 'Embroidery Placement', 'text'),
                ),
            ],
            'style': [
                field('front_neck', 'Front Neck', 'text'),
                field('back_neck', 'Back Neck', 'text'),
                field('collar', 'Collar', 'text'),
                field('padding', 'Padding', 'boolean'),
                field('zip', 'Zip', 'boolean'),
                field('pocket', 'Pocket', 'boolean'),
                field('border', 'Border', 'boolean'),
                field('backing', 'Backing', 'boolean'),
            ],
            'materials': [
                material('fabric', 'Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('can_can', 'Can Can', Inv.LINING),
                material('border_material', 'Border', Inv.BORDER, when=eq('border', True)),
            ],
        },
    },
    {
        'key': 'petticoat', 'name': 'Petticoat', 'sequence': 80,
        'design_parts': parts('Overall Petticoat Design', 'Waist Design', 'Flare / Ghera Design',
              'Bottom / Border Design', 'Side Design'),
        'sections': {
            'measurements': [
                measurement('length', 'Length', required=True),
                measurement('waist', 'Waist', required=True),
            ],
            'style': [
                field('waist_finish', 'Waist Finish', 'multiselect', options=WAIST_FINISH),
            ],
            'materials': bottom_materials(),
        },
    },
    {
        'key': 'bottom_wear', 'name': 'Bottom Wear', 'sequence': 90,
        'design_parts': parts('Overall Design', 'Waist Design', 'Upper / Thigh Design',
              'Leg Design', 'Bottom / Ankle Design', 'Flare / Ghera Design',
              'Border Design', 'Pocket Design', 'Embroidery Design', 'Print Design'),
        'sections': {
            'basic': [
                field('bottom_type', 'Bottom Type', 'select', required=True, options=[
                    'Salwar', 'Churidar', 'Palazzo', 'Sharara', 'Patiala',
                    'Cigarette Pant', 'Dhoti', 'Other']),
                field('bottom_type_other', 'Specify Type', 'text', required=True,
                      when=eq('bottom_type', 'other')),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('waist', 'Waist', required=True),
                measurement('hip', 'Hip'),
                measurement('thigh', 'Thigh'),
                measurement('upper_thigh', 'Upper Thigh'),
                measurement('knee', 'Knee'),
                measurement('calf', 'Calf'),
                measurement('ankle', 'Ankle'),
                measurement('crotch', 'Crotch'),
                # Sharara only, like the can-can material below: every other
                # bottom type sees exactly the list above. All optional, folded
                # behind a "+" per group. Waist, hip and full length are asked
                # above; waist closure is `waist_finish` (style).
                *grouped('Body',
                    measurement('high_waist', 'High Waist'),
                    measurement('waist_to_hip', 'Waist-to-Hip'),
                    measurement('waist_to_floor', 'Waist-to-Floor'),
                    measurement('heel_height', 'Heel Height'),
                    when=one_of('bottom_type', ['sharara'])),
                *grouped('Sharara Construction',
                    measurement('waistband_width', 'Waistband'),
                    measurement('upper_panel_length', 'Upper Panel Length'),
                    measurement('flare_start', 'Flare Starting Point'),
                    field('panel_count', 'Number of Panels', 'number',
                          validation={'min': 0, 'max': 60, 'step': 1}),
                    measurement('panel_width', 'Panel Width'),
                    measurement('total_ghera', 'Total Ghera',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    measurement('bottom_circumference', 'Bottom Circumference',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    field('seam_placement', 'Center / Front / Back Seam', 'text'),
                    when=one_of('bottom_type', ['sharara'])),
                *grouped('Layers / Pattern',
                    measurement('layer_height', 'Layer Height'),
                    measurement('layer_width', 'Layer Width',
                                validation={'min': 0, 'max': 600, 'step': 0.25}),
                    field('gather_amount', 'Gather Amount', 'text'),
                    measurement('border_width', 'Border Width'),
                    field('border_placement', 'Border Placement', 'text'),
                    measurement('motif_size', 'Motif Size'),
                    measurement('motif_spacing', 'Motif Spacing'),
                    measurement('pattern_repeat', 'Pattern Repeat'),
                    field('panel_matching', 'Panel Matching', 'text'),
                    field('embroidery_placement', 'Embroidery Placement', 'text'),
                    when=one_of('bottom_type', ['sharara'])),
                *grouped('Inner',
                    field('lining_details', 'Lining', 'text'),
                    field('cancan_details', 'Can-Can', 'text'),
                    field('inner_shorts', 'Inner Shorts / Underskirt', 'text'),
                    field('fastening', 'Zip / Hooks / Dori', 'multiselect',
                          options=['Zip', 'Hooks', 'Dori']),
                    when=one_of('bottom_type', ['sharara'])),
                # Churidar only, same shape. Waist, hip, thigh, knee, calf,
                # ankle, rise (crotch) and full length are asked above; bottom
                # opening is `bottom_width` and waist closure `waist_finish`
                # (style). Keys the sharara groups already use get a prefix,
                # since a template's keys are one namespace.
                *grouped('Body',
                    measurement('inseam', 'Inseam'),
                    measurement('outseam', 'Outseam'),
                    when=one_of('bottom_type', ['churidar'])),
                *grouped('Churidar-specific',
                    measurement('ankle_finished', 'Ankle Finished Measurement'),
                    measurement('churi_length', 'Churi / Gather Length'),
                    field('churi_folds', 'Number of Churi Folds', 'number',
                          validation={'min': 0, 'max': 60, 'step': 1}),
                    measurement('knee_fitting', 'Knee Fitting'),
                    measurement('thigh_fitting', 'Thigh Fitting'),
                    measurement('churidar_waistband', 'Waistband'),
                    when=one_of('bottom_type', ['churidar'])),
                *grouped('Pattern',
                    measurement('ankle_border', 'Ankle Border'),
                    measurement('side_border', 'Side Border'),
                    field('motif_placement', 'Motif Placement', 'text'),
                    field('churidar_embroidery_placement', 'Embroidery Placement', 'text'),
                    measurement('churidar_pattern_repeat', 'Pattern Repeat'),
                    field('pattern_direction', 'Pattern Direction', 'text'),
                    when=one_of('bottom_type', ['churidar'])),
                *grouped('Plain',
                    field('fabric_stretch', 'Fabric Stretch', 'text'),
                    measurement('ease', 'Ease'),
                    field('churidar_fastening', 'Drawstring / Elastic / Zip', 'multiselect',
                          options=['Drawstring', 'Elastic', 'Zip']),
                    when=one_of('bottom_type', ['churidar'])),
            ],
            'style': [
                field('waist_finish', 'Waist Finish', 'select', options=WAIST_FINISH),
                field('bottom_finish', 'Bottom Finish', 'select',
                      options=['Round', 'Flared', 'Ankle', 'Straight']),
                field('bottom_width', 'Bottom Width', 'select', options=[
                    ('11', '11"'), ('15', '15"'), ('17', '17"'),
                    ('20', '20"'), ('24', '24"')]),
                field('pocket_required', 'Pockets', 'boolean'),
            ],
            'materials': bottom_materials(extra=[
                material('can_can', 'Can Can', Inv.LINING,
                         when=one_of('bottom_type', ['sharara'])),
                material('zip', 'Zip', Inv.STITCHING),
            ]),
        },
    },
    {
        'key': 'gown', 'name': 'Gown', 'sequence': 130,
        'design_parts': parts('Front Design', 'Back Design', 'Neck Design', 'Sleeve Design',
              'Waist Design', 'Skirt / Flare Design', 'Border / Hem Design',
              'Side Design', 'Embroidery Design', 'Print Design'),
        'sections': {
            'basic': [
                field('gown_type', 'Gown Type', 'select', required=True, options=[
                    'A-Line', 'Mermaid', 'Ball Gown', 'Sheath', 'Empire',
                    ('cape_gown', 'Cape Gown'), 'Indo-Western']),
            ],
            'measurements': [
                measurement('floor_length', 'Floor Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('upper_chest', 'Upper Chest'),
                measurement('chest', 'Chest'),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                measurement('armhole', 'Armhole'),
            ],
            'style': [
                *sleeve_and_neck(),
                field('back_style', 'Back Style', 'select', options=[
                    ('deep_u', 'Deep U'), 'Keyhole', 'Backless', 'Standard']),
                field('padding', 'Padding', 'boolean'),
                field('slit', 'Slit', 'select', options=['Left', 'Right', 'Both', 'None']),
                field('train', 'Train', 'select', options=['None', 'Sweep', 'Chapel', 'Cathedral']),
                field('zip_position', 'Zip', 'select', options=['Side', 'Back', 'None']),
            ],
            'materials': [
                material('main_fabric', 'Main Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('can_can', 'Can Can', Inv.LINING),
                material('cups', 'Cups', Inv.EMBELLISHMENT, when=eq('padding', True)),
                material('boning', 'Boning', Inv.EMBELLISHMENT),
                material('zip', 'Zip', Inv.STITCHING, when=neq('zip_position', 'none')),
                material('hooks', 'Hooks', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'suit', 'name': 'Suit (Kameez)', 'sequence': 140,
        'design_parts': parts('Front Design', 'Back Design', 'Neck Design', 'Sleeve Design',
              'Side Design', 'Bottom / Salwar Design', 'Border Design',
              'Embroidery Design', 'Print Design'),
        'sections': {
            'basic': [
                field('suit_type', 'Suit Type', 'select', required=True, options=[
                    'Straight Cut', 'A-Line', 'Anarkali Cut', 'Angrakha', 'Kalidar']),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('upper_chest', 'Upper Chest'),
                measurement('chest', 'Chest'),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                measurement('armhole', 'Armhole'),
                measurement('arm_length', 'Arm Length'),
            ],
            'style': [
                *sleeve_and_neck(),
                field('slit', 'Side Slit', 'select', options=['Left', 'Right', 'Both', 'None']),
                field('zip_position', 'Zip', 'select', options=['Side', 'Front', 'Back', 'None']),
                field('pocket', 'Pocket', 'boolean'),
                field('padding', 'Padding', 'boolean'),
                field('border', 'Border', 'boolean'),
            ],
            'materials': [
                material('main_fabric', 'Main Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('border_material', 'Border', Inv.BORDER, when=eq('border', True)),
                material('cups', 'Cups', Inv.EMBELLISHMENT, when=eq('padding', True)),
                material('zip', 'Zip', Inv.STITCHING, when=neq('zip_position', 'none')),
                material('buttons', 'Buttons', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'sherwani', 'name': 'Sherwani', 'sequence': 150,
        'design_parts': parts('Front Design', 'Back Design', 'Collar / Neck Design',
              'Sleeve Design', 'Button Design', 'Pocket Design',
              'Hem / Bottom Design', 'Side Design', 'Embroidery Design',
              'Print / Pattern Design'),
        'sections': {
            'basic': [
                field('sherwani_type', 'Sherwani Type', 'select', required=True, options=[
                    'Classic', 'Angrakha', 'Indo-Western', 'Jodhpuri', 'Achkan']),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('chest', 'Chest'),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                measurement('arm_length', 'Arm Length'),
                measurement('neck', 'Neck'),
            ],
            'style': [
                field('collar_style', 'Collar Style', 'select', options=[
                    'Bandhgala', 'Mandarin', 'Nehru', 'Shawl', 'Notch']),
                field('front_closure', 'Front Closure', 'select', options=[
                    'Buttons', 'Hooks', 'Concealed Zip', 'Open Front']),
                field('vent', 'Vent', 'select', options=['Centre', 'Side', 'None']),
                field('pocket', 'Pocket', 'boolean'),
                field('embroidery_finish', 'Embroidery Finish', 'select',
                      options=['None', 'Machine', 'Hand', 'Maggam', 'Zardozi']),
            ],
            'materials': [
                material('main_fabric', 'Main Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('canvas', 'Canvas', Inv.LINING),
                material('buttons', 'Buttons', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
                material('embroidery_material', 'Embroidery Material', Inv.MAGGAM,
                         when=not_one_of('embroidery_finish', ['none'])),
            ],
        },
    },
    {
        # The ethnic jacket: worn over a lehenga, saree, kurta or anarkali, or
        # as a bandhgala on its own. Measured the way a sherwani is, and its
        # reference-photo parts are a sherwani's too -- front, back, collar,
        # sleeve, hem -- because that is what a photograph of a jacket shows.
        'key': 'jacket', 'name': 'Jacket', 'sequence': 160,
        'design_parts': parts('Front Design', 'Back Design', 'Collar / Neck Design',
              'Sleeve Design', 'Button Design', 'Pocket Design',
              'Hem / Bottom Design', 'Side Design', 'Embroidery Design',
              'Print / Pattern Design'),
        'sections': {
            'basic': [
                field('jacket_type', 'Jacket Type', 'select', required=True, options=[
                    'Nehru', 'Bandhgala', 'Achkan', 'Indo-Western', 'Angrakha',
                    'Lehenga Jacket', 'Saree Jacket', 'Kurta Jacket', 'Cape']),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('chest', 'Chest'),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                measurement('arm_length', 'Arm Length'),
                measurement('neck', 'Neck'),
            ],
            'style': [
                field('collar_style', 'Collar Style', 'select', options=[
                    'Nehru', 'Mandarin', 'Band', 'Shirt', 'Shawl', 'Notch', 'Collarless']),
                field('front_closure', 'Front Closure', 'select', options=[
                    'Open Front', 'Buttons', 'Hooks', 'Zip', 'Angrakha', 'Wrap']),
                field('pocket', 'Pocket', 'boolean'),
                field('embroidery_finish', 'Embroidery Finish', 'select',
                      options=['None', 'Machine', 'Hand', 'Maggam', 'Zardozi']),
            ],
            'materials': [
                material('main_fabric', 'Main Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('buttons', 'Buttons', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
                material('embroidery_material', 'Embroidery Material', Inv.MAGGAM,
                         when=not_one_of('embroidery_finish', ['none'])),
            ],
        },
    },
    # --- men's wear --------------------------------------------------------
    #
    # One template per garment family, the way Bottom Wear replaced four
    # bottoms in 0007: the family is the template, the cut is a `*_type`
    # select, the fit is a `fit` select, and the parts a photograph can be of
    # are design_parts. Sherwani and Jacket above already cover the wedding
    # and ethnic-jacket families, so they are not repeated here.
    {
        'key': 'shirt', 'name': "Men's Shirt", 'sequence': 170,
        'design_parts': parts('Overall Shirt Design', 'Collar Design', 'Front / Placket Design',
              'Back Design', 'Sleeve Design', 'Cuff Design', 'Pocket Design',
              'Yoke Design', 'Hem Design', 'Print / Pattern Design',
              'Embroidery Design'),
        'sections': {
            'basic': [
                field('shirt_type', 'Shirt Type', 'select', required=True, options=[
                    'Formal', 'Casual', 'Dress', 'Oxford', 'Linen', 'Denim', 'Printed',
                    'Checked', 'Striped', 'Short Kurta Shirt', 'Other']),
                field('shirt_type_other', 'Specify Type', 'text', required=True,
                      when=eq('shirt_type', 'other')),
                field('fit', 'Fit', 'select', options=['Slim Fit', 'Regular Fit', 'Oversized']),
            ],
            'measurements': [
                measurement('shirt_length', 'Shirt Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('chest', 'Chest', required=True),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                measurement('neck', 'Neck'),
                measurement('sleeve_length', 'Sleeve Length'),
                measurement('armhole', 'Armhole'),
                measurement('bicep', 'Bicep'),
                measurement('cuff', 'Cuff'),
                # The ten above stay as they were. The rest is optional and
                # folds behind a "+" per group. Shirt length, shoulder, chest,
                # waist, hip, neck, sleeve length, armhole, bicep and cuff are
                # already asked above, so they are not repeated.
                *grouped('Body',
                    measurement('height', 'Height'),
                    measurement('underbust', 'Underbust'),
                    measurement('high_waist', 'High Waist'),
                    measurement('elbow', 'Elbow'),
                    measurement('wrist', 'Wrist'),
                ),
                *grouped('Length',
                    measurement('shoulder_to_waist', 'Shoulder-to-Waist'),
                    measurement('shoulder_to_hip', 'Shoulder-to-Hip'),
                    measurement('front_length', 'Front Length'),
                    measurement('back_length', 'Back Length'),
                    measurement('side_length', 'Side Length'),
                ),
                *grouped('Neck',
                    measurement('neck_width', 'Neck Width'),
                    measurement('front_neck_depth', 'Front Depth'),
                    measurement('back_neck_depth', 'Back Depth'),
                    measurement('collar_height', 'Collar Height'),
                    measurement('collar_width', 'Collar Width'),
                ),
                *grouped('Sleeves',
                    measurement('sleeve_opening', 'Sleeve Opening'),
                    measurement('cuff_height', 'Cuff Height'),
                ),
                *grouped('Pattern',
                    measurement('shirt_border', 'Shirt Border'),
                    measurement('hem_border', 'Hem Border'),
                    measurement('sleeve_border', 'Sleeve Border'),
                    measurement('collar_border', 'Collar Border'),
                    field('front_motif', 'Front Motif', 'text'),
                    field('back_motif', 'Back Motif', 'text'),
                    measurement('pattern_repeat', 'Pattern Repeat'),
                    field('pattern_direction', 'Pattern Direction', 'text'),
                    field('pocket_placement', 'Pocket Placement', 'text'),
                    measurement('pocket_size', 'Pocket Size'),
                ),
            ],
            'style': [
                field('collar_style', 'Collar', 'select', options=[
                    'Spread', 'Point', 'Button Down', 'Mandarin', 'Cuban', 'Band', 'Club']),
                field('sleeve_style', 'Sleeve', 'select', options=['Half Sleeve', 'Full Sleeve']),
                field('cuff_style', 'Cuff', 'select', options=[
                    'Single Button', 'Double Button', 'French', 'Rounded', 'Square'],
                      when=eq('sleeve_style', 'full_sleeve')),
                field('placket', 'Placket', 'select', options=['Plain', 'French', 'Hidden']),
                field('pocket', 'Pocket', 'select', options=['None', 'One', 'Two']),
                field('back_style', 'Back', 'select', options=[
                    'Plain', 'Box Pleat', 'Side Pleats', 'Darts']),
            ],
            'materials': [
                material('fabric', 'Fabric', Inv.FABRIC),
                material('interlining', 'Collar / Cuff Interlining', Inv.LINING),
                material('buttons', 'Buttons', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 't_shirt', 'name': 'T-Shirt', 'sequence': 180,
        'design_parts': parts('Overall T-Shirt Design', 'Neck Design', 'Front Design',
              'Back Design', 'Sleeve Design', 'Hem Design', 'Print / Graphic Design'),
        'sections': {
            'basic': [
                field('tshirt_type', 'T-Shirt Type', 'select', required=True, options=[
                    'Crew Neck', 'V-Neck', 'Polo', 'Henley', 'Round Neck', 'Oversized',
                    'Graphic', 'Printed', 'Tank Top', 'Sports', 'Other']),
                field('tshirt_type_other', 'Specify Type', 'text', required=True,
                      when=eq('tshirt_type', 'other')),
                field('fit', 'Fit', 'select', options=['Slim Fit', 'Regular Fit', 'Oversized']),
            ],
            'measurements': [
                measurement('shirt_length', 'Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('chest', 'Chest', required=True),
                measurement('waist', 'Waist'),
                measurement('sleeve_length', 'Sleeve Length'),
                measurement('bicep', 'Bicep'),
            ],
            'style': [
                field('sleeve_style', 'Sleeve', 'select', options=[
                    'Sleeveless', 'Half Sleeve', 'Full Sleeve']),
                field('neck_finish', 'Neck Finish', 'select', options=['Rib', 'Self Fabric', 'Collar']),
                field('pocket', 'Pocket', 'boolean'),
            ],
            'materials': [
                material('fabric', 'Fabric', Inv.FABRIC),
                material('rib', 'Rib', Inv.FABRIC),
                material('thread', 'Thread', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'kurta', 'name': "Men's Kurta", 'sequence': 190,
        'design_parts': parts('Overall Kurta Design', 'Front Design', 'Back Design',
              'Collar / Neck Design', 'Placket Design', 'Sleeve Design', 'Cuff Design',
              'Side Slit Design', 'Hem Design', 'Pocket Design', 'Embroidery Design',
              'Print Design'),
        'sections': {
            'basic': [
                field('kurta_type', 'Kurta Type', 'select', required=True, options=[
                    'Straight', 'Short', 'Long', 'Pathani', 'Asymmetric', 'Angrakha',
                    'Lucknowi', 'Other']),
                field('kurta_type_other', 'Specify Type', 'text', required=True,
                      when=eq('kurta_type', 'other')),
                field('fit', 'Fit', 'select', options=['Slim Fit', 'Regular Fit', 'Relaxed Fit']),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('chest', 'Chest', required=True),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                measurement('neck', 'Neck'),
                measurement('arm_length', 'Arm Length'),
                measurement('armhole', 'Armhole'),
                measurement('bicep', 'Bicep'),
                measurement('cuff', 'Cuff'),
                measurement('slit_length', 'Slit Length'),
            ],
            'style': [
                field('collar_style', 'Collar', 'select', options=[
                    'Nehru', 'Band', 'Mandarin', 'Shirt', 'Collarless']),
                field('placket', 'Placket', 'select', options=[
                    'Short', 'Long', 'Angrakha', 'Side', 'Hidden']),
                field('sleeve_style', 'Sleeve', 'select', options=['Half Sleeve', 'Full Sleeve']),
                field('cuff_style', 'Cuff', 'select', options=['Plain', 'Buttoned', 'Roll-Up'],
                      when=eq('sleeve_style', 'full_sleeve')),
                field('slit', 'Side Slit', 'select', options=['Both', 'None']),
                field('pocket', 'Pocket', 'select', options=['None', 'Chest', 'Side', 'Both']),
                field('embroidery_finish', 'Embroidery Finish', 'select',
                      options=['None', 'Machine', 'Hand', 'Chikankari', 'Zardozi']),
            ],
            'materials': [
                material('fabric', 'Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('buttons', 'Buttons', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
                material('embroidery_material', 'Embroidery Material', Inv.MAGGAM,
                         when=not_one_of('embroidery_finish', ['none'])),
            ],
        },
    },
    {
        'key': 'indo_western', 'name': 'Indo-Western', 'sequence': 200,
        'design_parts': parts('Overall Design', 'Front Design', 'Back Design',
              'Collar / Neck Design', 'Sleeve Design', 'Drape / Layer Design',
              'Jacket / Waistcoat Design', 'Hem Design', 'Embroidery Design',
              'Print / Pattern Design'),
        'sections': {
            'basic': [
                field('indo_western_type', 'Indo-Western Type', 'select', required=True, options=[
                    'Kurta', 'Jacket', 'Asymmetric', 'Draped', 'Layered', 'Suit',
                    'Kurta with Jacket', 'Kurta with Waistcoat', 'Kurta with Nehru Jacket']),
                field('fit', 'Fit', 'select', options=['Slim Fit', 'Regular Fit']),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('chest', 'Chest', required=True),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                measurement('neck', 'Neck'),
                measurement('arm_length', 'Arm Length'),
                measurement('jacket_length', 'Jacket / Waistcoat Length',
                            when=one_of('indo_western_type', [
                                'jacket', 'kurta_with_jacket', 'kurta_with_waistcoat',
                                'kurta_with_nehru_jacket'])),
            ],
            'style': [
                field('collar_style', 'Collar', 'select', options=[
                    'Bandhgala', 'Mandarin', 'Nehru', 'Shawl', 'Notch', 'Collarless']),
                field('front_closure', 'Front Closure', 'select', options=[
                    'Buttons', 'Hooks', 'Concealed Zip', 'Open Front', 'Asymmetric']),
                field('drape', 'Drape / Layer', 'select', options=['None', 'Single', 'Double'],
                      when=one_of('indo_western_type', ['draped', 'layered', 'asymmetric'])),
                field('embroidery_finish', 'Embroidery Finish', 'select',
                      options=['None', 'Machine', 'Hand', 'Maggam', 'Zardozi']),
            ],
            'materials': [
                material('main_fabric', 'Main Fabric', Inv.FABRIC),
                material('jacket_fabric', 'Jacket / Waistcoat Fabric', Inv.FABRIC,
                         when=one_of('indo_western_type', [
                             'jacket', 'kurta_with_jacket', 'kurta_with_waistcoat',
                             'kurta_with_nehru_jacket'])),
                material('lining', 'Lining', Inv.LINING),
                material('buttons', 'Buttons', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
                material('embroidery_material', 'Embroidery Material', Inv.MAGGAM,
                         when=not_one_of('embroidery_finish', ['none'])),
            ],
        },
    },
    {
        'key': 'mens_suit', 'name': "Men's Suit", 'sequence': 210,
        'design_parts': parts('Overall Suit Design', 'Jacket Front Design', 'Jacket Back Design',
              'Lapel / Collar Design', 'Sleeve Design', 'Pocket Design', 'Button Design',
              'Waistcoat Design', 'Trouser Design', 'Lining Design'),
        'sections': {
            'basic': [
                field('suit_type', 'Suit Type', 'select', required=True, options=[
                    'Two-Piece', 'Three-Piece', 'Tuxedo', 'Dinner', 'Business', 'Wedding',
                    'Bandhgala', 'Jodhpuri']),
                field('breast', 'Breast', 'select', options=['Single-Breasted', 'Double-Breasted']),
                field('fit', 'Fit', 'select', options=['Slim Fit', 'Regular Fit']),
            ],
            'measurements': [
                measurement('jacket_length', 'Jacket Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('chest', 'Chest', required=True),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                measurement('neck', 'Neck'),
                measurement('arm_length', 'Arm Length'),
                measurement('bicep', 'Bicep'),
                measurement('trouser_length', 'Trouser Length', required=True),
                measurement('inseam', 'Inseam'),
                measurement('thigh', 'Thigh'),
                measurement('knee', 'Knee'),
                measurement('bottom_opening', 'Bottom Opening'),
                measurement('waistcoat_length', 'Waistcoat Length',
                            when=eq('suit_type', 'three_piece')),
            ],
            'style': [
                field('lapel', 'Lapel', 'select', options=['Notch', 'Peak', 'Shawl', 'Bandhgala']),
                field('buttons_count', 'Buttons', 'select', options=[
                    ('1', '1 Button'), ('2', '2 Buttons'), ('3', '3 Buttons'), ('6', '6 Buttons')]),
                field('vent', 'Vent', 'select', options=['Centre', 'Side', 'None']),
                field('jacket_pocket', 'Jacket Pocket', 'select', options=[
                    'Flap', 'Jetted', 'Patch', 'Ticket']),
                field('trouser_front', 'Trouser Front', 'select', options=['Flat Front', 'Pleated']),
                field('trouser_hem', 'Trouser Hem', 'select', options=['Plain', 'Cuffed']),
            ],
            'materials': [
                material('main_fabric', 'Suiting Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('canvas', 'Canvas / Fusing', Inv.LINING),
                material('buttons', 'Buttons', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
                material('shoulder_pads', 'Shoulder Pads', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'trouser', 'name': 'Trouser', 'sequence': 220,
        'design_parts': parts('Overall Trouser Design', 'Waistband Design', 'Front / Pleat Design',
              'Back Design', 'Pocket Design', 'Leg Design', 'Hem Design'),
        'sections': {
            'basic': [
                field('trouser_type', 'Trouser Type', 'select', required=True, options=[
                    'Formal', 'Dress', 'Chinos', 'Casual', 'Linen', 'Cotton', 'Cargo',
                    'Utility', 'Other']),
                field('trouser_type_other', 'Specify Type', 'text', required=True,
                      when=eq('trouser_type', 'other')),
                field('fit', 'Fit', 'select', options=[
                    'Straight Fit', 'Slim Fit', 'Regular Fit', 'Tapered', 'Wide Leg']),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('waist', 'Waist', required=True),
                measurement('hip', 'Hip'),
                measurement('thigh', 'Thigh'),
                measurement('knee', 'Knee'),
                measurement('bottom_opening', 'Bottom Opening'),
                measurement('inseam', 'Inseam'),
                measurement('crotch', 'Crotch'),
                # The eight above stay as they were. The rest is optional and
                # folds behind a "+" per group. Waist, hip, thigh, knee, full
                # length, inseam and rise (crotch) are asked above; pleats are
                # `front_style` (style), so none is repeated.
                *grouped('Body',
                    measurement('high_waist', 'High Waist'),
                    measurement('waist_to_hip', 'Waist-to-Hip'),
                    measurement('front_rise', 'Front Rise'),
                    measurement('back_rise', 'Back Rise'),
                    measurement('calf', 'Calf'),
                    measurement('ankle', 'Ankle'),
                    measurement('outseam', 'Outseam'),
                ),
                *grouped('Construction',
                    measurement('waistband_width', 'Waistband Width'),
                    measurement('belt_loop_width', 'Belt Loop Width'),
                    field('pocket_placement', 'Pocket Placement', 'text'),
                    measurement('pocket_opening', 'Pocket Opening'),
                    measurement('zip_length', 'Zip Length'),
                    field('hook_button_placement', 'Hook / Button Placement', 'text'),
                    measurement('cuff_width', 'Cuff Width'),
                    field('darts', 'Darts', 'text'),
                ),
                *grouped('Pattern / Border',
                    measurement('side_border_width', 'Side Border Width'),
                    measurement('bottom_border_width', 'Bottom Border Width'),
                    field('border_placement', 'Border Placement', 'text'),
                    field('print_direction', 'Print Direction', 'text'),
                    measurement('motif_size', 'Motif Size'),
                    measurement('motif_repeat', 'Motif Repeat'),
                    field('pattern_matching', 'Pattern Matching', 'text'),
                    field('embroidery_placement', 'Embroidery Placement', 'text'),
                ),
            ],
            'style': [
                field('front_style', 'Front', 'select', options=['Flat Front', 'Single Pleat', 'Double Pleat']),
                field('waist_finish', 'Waist Finish', 'select', options=[
                    'Belt Loops', 'Side Adjusters', 'Elastic']),
                field('hem_finish', 'Hem', 'select', options=['Plain', 'Cuffed']),
                field('pocket', 'Pockets', 'select', options=[
                    'Side Only', 'Side + Back', 'Cargo']),
            ],
            'materials': [
                material('fabric', 'Fabric', Inv.FABRIC),
                material('pocketing', 'Pocketing', Inv.LINING),
                material('waistband_lining', 'Waistband Lining', Inv.LINING),
                material('zip', 'Zip', Inv.STITCHING),
                material('buttons', 'Buttons / Hook', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'jeans', 'name': 'Jeans', 'sequence': 230,
        'design_parts': parts('Overall Jeans Design', 'Waistband Design', 'Front Design',
              'Back / Yoke Design', 'Pocket Design', 'Leg Design', 'Hem Design',
              'Wash / Distress Design'),
        'sections': {
            'basic': [
                field('jeans_type', 'Jeans Type', 'select', required=True, options=[
                    'Straight Fit', 'Slim Fit', 'Skinny', 'Regular Fit', 'Relaxed Fit',
                    'Tapered', 'Bootcut', 'Wide Leg', 'Distressed', 'Ripped', 'Denim Joggers']),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('waist', 'Waist', required=True),
                measurement('hip', 'Hip'),
                measurement('thigh', 'Thigh'),
                measurement('knee', 'Knee'),
                measurement('bottom_opening', 'Bottom Opening'),
                measurement('inseam', 'Inseam'),
                measurement('crotch', 'Crotch'),
            ],
            'style': [
                field('rise', 'Rise', 'select', options=['Low', 'Mid', 'High']),
                field('closure', 'Closure', 'select', options=['Zip Fly', 'Button Fly']),
                field('wash', 'Wash', 'select', options=['Raw', 'Light', 'Medium', 'Dark', 'Black']),
                field('hem_finish', 'Hem', 'select', options=['Plain', 'Cuffed', 'Raw Edge']),
            ],
            'materials': [
                material('fabric', 'Denim', Inv.FABRIC),
                material('pocketing', 'Pocketing', Inv.LINING),
                material('zip', 'Zip', Inv.STITCHING),
                material('buttons', 'Buttons / Rivets', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'shorts', 'name': 'Shorts', 'sequence': 240,
        'design_parts': parts('Overall Shorts Design', 'Waistband Design', 'Front Design',
              'Back Design', 'Pocket Design', 'Hem Design'),
        'sections': {
            'basic': [
                field('shorts_type', 'Shorts Type', 'select', required=True, options=[
                    'Casual', 'Formal', 'Bermuda', 'Denim', 'Cargo', 'Chino', 'Sports', 'Linen']),
                field('fit', 'Fit', 'select', options=['Slim Fit', 'Regular Fit', 'Relaxed Fit']),
            ],
            'measurements': [
                measurement('full_length', 'Length', required=True),
                measurement('waist', 'Waist', required=True),
                measurement('hip', 'Hip'),
                measurement('thigh', 'Thigh'),
                measurement('bottom_opening', 'Bottom Opening'),
                measurement('inseam', 'Inseam'),
            ],
            'style': [
                field('waist_finish', 'Waist Finish', 'select', options=[
                    'Belt Loops', 'Elastic', 'Drawstring']),
                field('pocket', 'Pockets', 'select', options=['Side Only', 'Side + Back', 'Cargo']),
                field('hem_finish', 'Hem', 'select', options=['Plain', 'Cuffed']),
            ],
            'materials': [
                material('fabric', 'Fabric', Inv.FABRIC),
                material('pocketing', 'Pocketing', Inv.LINING),
                material('zip', 'Zip', Inv.STITCHING),
                material('elastic', 'Elastic / Drawstring', Inv.STITCHING,
                         when=one_of('waist_finish', ['elastic', 'drawstring'])),
                material('thread', 'Thread', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'mens_bottom_wear', 'name': "Men's Bottom Wear", 'sequence': 250,
        'design_parts': parts('Overall Design', 'Waist Design', 'Leg Design',
              'Bottom / Ankle Design', 'Pleat / Drape Design', 'Pocket Design',
              'Border Design', 'Embroidery Design'),
        'sections': {
            'basic': [
                field('bottom_type', 'Bottom Type', 'select', required=True, options=[
                    'Churidar', 'Pajama', 'Pathani Pajama', 'Salwar', 'Dhoti', 'Dhoti Pants',
                    'Afghani Pants', 'Patiala Pajama', 'Pleated Dhoti Pants', 'Other']),
                field('bottom_type_other', 'Specify Type', 'text', required=True,
                      when=eq('bottom_type', 'other')),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('waist', 'Waist', required=True),
                measurement('hip', 'Hip'),
                measurement('thigh', 'Thigh'),
                measurement('knee', 'Knee'),
                measurement('calf', 'Calf'),
                measurement('ankle', 'Ankle'),
                measurement('crotch', 'Crotch'),
            ],
            'style': [
                field('waist_finish', 'Waist Finish', 'select', options=WAIST_FINISH),
                field('bottom_finish', 'Bottom Finish', 'select',
                      options=['Straight', 'Tapered', 'Ankle', 'Gathered']),
                field('pocket_required', 'Pockets', 'boolean'),
            ],
            'materials': bottom_materials(extra=[
                material('zip', 'Zip', Inv.STITCHING),
            ]),
        },
    },
    {
        'key': 'coat', 'name': 'Coat / Overcoat', 'sequence': 260,
        'design_parts': parts('Overall Coat Design', 'Front Design', 'Back Design',
              'Lapel / Collar Design', 'Sleeve Design', 'Pocket Design', 'Button Design',
              'Hem Design', 'Lining Design'),
        'sections': {
            'basic': [
                field('coat_type', 'Coat Type', 'select', required=True, options=[
                    'Formal', 'Suit Coat', 'Long Coat', 'Overcoat', 'Trench', 'Peacoat',
                    'Chesterfield', 'Winter', 'Designer']),
                field('breast', 'Breast', 'select', options=['Single-Breasted', 'Double-Breasted']),
                field('fit', 'Fit', 'select', options=['Slim Fit', 'Regular Fit']),
            ],
            'measurements': [
                measurement('full_length', 'Full Length', required=True),
                measurement('shoulder', 'Shoulder'),
                measurement('chest', 'Chest', required=True),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip'),
                measurement('neck', 'Neck'),
                measurement('arm_length', 'Arm Length'),
                measurement('bicep', 'Bicep'),
            ],
            'style': [
                field('lapel', 'Lapel / Collar', 'select', options=[
                    'Notch', 'Peak', 'Shawl', 'Stand', 'Storm Collar']),
                field('front_closure', 'Front Closure', 'select', options=[
                    'Buttons', 'Concealed Buttons', 'Zip', 'Belted']),
                field('vent', 'Vent', 'select', options=['Centre', 'Side', 'None']),
                field('pocket', 'Pocket', 'select', options=['Flap', 'Welt', 'Patch', 'Slanted']),
            ],
            'materials': [
                material('main_fabric', 'Main Fabric', Inv.FABRIC),
                material('lining', 'Lining', Inv.LINING),
                material('canvas', 'Canvas / Fusing', Inv.LINING),
                material('buttons', 'Buttons', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
                material('shoulder_pads', 'Shoulder Pads', Inv.STITCHING),
            ],
        },
    },
    {
        'key': 'casual_wear', 'name': 'Casual Wear', 'sequence': 270,
        'design_parts': parts('Overall Design', 'Front Design', 'Back Design', 'Neck / Hood Design',
              'Sleeve Design', 'Pocket Design', 'Hem / Cuff Design', 'Print / Graphic Design'),
        'sections': {
            'basic': [
                field('casual_type', 'Garment', 'select', required=True, options=[
                    'Hoodie', 'Sweatshirt', 'Pullover', 'Cardigan', 'Sweater', 'Tracksuit',
                    'Joggers', 'Lounge Pants', 'Track Pants', 'Co-Ord Set']),
                field('fit', 'Fit', 'select', options=['Slim Fit', 'Regular Fit', 'Oversized']),
            ],
            'measurements': [
                measurement('full_length', 'Length', required=True),
                measurement('shoulder', 'Shoulder',
                            when=not_one_of('casual_type', ['joggers', 'lounge_pants', 'track_pants'])),
                measurement('chest', 'Chest',
                            when=not_one_of('casual_type', ['joggers', 'lounge_pants', 'track_pants'])),
                measurement('sleeve_length', 'Sleeve Length',
                            when=not_one_of('casual_type', ['joggers', 'lounge_pants', 'track_pants'])),
                measurement('waist', 'Waist'),
                measurement('hip', 'Hip',
                            when=one_of('casual_type', ['joggers', 'lounge_pants', 'track_pants',
                                                        'tracksuit', 'co_ord_set'])),
                measurement('inseam', 'Inseam',
                            when=one_of('casual_type', ['joggers', 'lounge_pants', 'track_pants',
                                                        'tracksuit', 'co_ord_set'])),
            ],
            'style': [
                field('neck_style', 'Neck', 'select', options=[
                    'Hood', 'Crew', 'V-Neck', 'Zip', 'Turtle', 'Collar'],
                      when=not_one_of('casual_type', ['joggers', 'lounge_pants', 'track_pants'])),
                field('closure', 'Closure', 'select', options=['Pullover', 'Full Zip', 'Half Zip', 'Buttons']),
                field('pocket', 'Pocket', 'select', options=['None', 'Kangaroo', 'Side', 'Zip']),
                field('cuff_finish', 'Cuff / Hem', 'select', options=['Rib', 'Elastic', 'Open', 'Drawstring']),
            ],
            'materials': [
                material('fabric', 'Fabric', Inv.FABRIC),
                material('rib', 'Rib', Inv.FABRIC),
                material('zip', 'Zip', Inv.STITCHING),
                material('drawstring', 'Drawstring / Elastic', Inv.STITCHING),
                material('thread', 'Thread', Inv.STITCHING),
            ],
        },
    },
]

SECTION_TITLES = [
    ('basic', 'Basic Information'),
    ('measurements', 'Measurements'),
    ('style', 'Style & Design Options'),
    ('materials', 'Materials & Accessories'),
    ('production', 'Production Notes'),
]

COMMON_BY_SECTION = {
    'basic': COMMON_BASIC,
    'measurements': COMMON_MEASUREMENTS,
    'materials': COMMON_MATERIALS,
    'production': COMMON_PRODUCTION,
}

#: Recorded on any garment with a print, embroidery, border, lace, stripe,
#: motif, panel or layered design. Optional on every garment that can carry
#: work (petticoat excepted), folded behind one "+" after the garment's own
#: groups. Keys carry a `design_` prefix because several garments already
#: ask a border width or motif size of their own under a per-garment group.
COMMON_PATTERN = grouped('Pattern / Design Details',
    field('design_pattern_type', 'Pattern Type', 'text'),
    field('design_pattern_direction', 'Pattern Direction', 'text'),
    measurement('design_pattern_repeat', 'Pattern Repeat'),
    measurement('design_motif_size', 'Motif Size'),
    measurement('design_motif_spacing', 'Motif Spacing'),
    measurement('design_border_width', 'Border Width'),
    field('design_border_placement', 'Border Placement', 'text'),
    measurement('design_border_distance', 'Distance Between Borders'),
    field('design_front_placement', 'Front Pattern Placement', 'text'),
    field('design_back_placement', 'Back Pattern Placement', 'text'),
    field('design_side_placement', 'Side Pattern Placement', 'text'),
    field('design_sleeve_placement', 'Sleeve Pattern Placement', 'text'),
    field('design_panel_matching', 'Panel-to-Panel Matching', 'text'),
    field('design_seam_matching', 'Seam Matching', 'text'),
    field('design_symmetry', 'Symmetry', 'text'),
    field('design_fabric_grain', 'Fabric Grain / Direction', 'text'),
    field('design_orientation', 'Pattern Upside / Downside', 'text'),
    field('design_embroidery_area', 'Embroidery Area', 'text'),
    field('design_embroidery_density', 'Embroidery Density', 'text'),
    field('design_extra_fabric', 'Extra Fabric Required for Matching', 'number', unit='m',
          validation={'min': 0, 'max': 20, 'step': 0.25}),
)


HAND_WORK_KINDS = [
    ('maggam', 'Maggam (Aari)'), 'Zardozi', 'Thread Embroidery',
    ('mirror_sequin', 'Mirror / Sequin'), ('bead_pearl', 'Bead / Pearl'), 'Cutwork',
]
#: The answer that means work is wanted. `hand_work` is the with/without
#: gate; anything but 'none' puts the order on the maggam path, which is
#: what every reader of it tests (flow_for_garments, isMaggamOrder).
HAND_WORK_WANTED = ['with_work']


#: Per-garment wording for the hand-work questions: (type label, parts label).
HAND_WORK_LABELS = {
    'lehenga': ('Type of Design', 'Design Required On'),
}


def hand_work_fields(definition):
    """The hand-work question every garment gets, beside its type on the
    order form: with or without work; and when with, which work, on which of
    its own parts, how dense, and a word for the maggam master. Required, so
    it is asked up front rather than folded under "More details"."""
    # The garment's own pieces (pallu, border, sleeves...), not the photo
    # categories that share the list (print, embroidery, the overall shot).
    skip = ('overall', 'print', 'embroidery', 'work', 'tassel', 'latkan')
    part_options = [(p['key'], re.sub(r'\s+Design$', '', p['label']))
                    for p in definition.get('design_parts', [])
                    if not any(w in p['key'] for w in skip)]
    has_work = one_of('hand_work', HAND_WORK_WANTED)
    # The counter talks about the design on the garment, not the work. Same
    # keys and options, so nothing that reads the answers changes.
    kind_label, parts_label = HAND_WORK_LABELS.get(
        definition['key'], ('Type of Design', 'Work On'))
    fields = [
        field('hand_work', 'Maggam / Hand Work', 'select', required=True, default='none',
              options=[('none', 'Without Work'), ('with_work', 'With Work')]),
        field('hand_work_kind', kind_label, 'select', options=HAND_WORK_KINDS, when=has_work),
        field('hand_work_density', 'Work Coverage', 'select',
              options=['Light', 'Medium', 'Heavy'], when=has_work),
        field('hand_work_notes', 'Notes for the Maggam Master', 'textarea',
              help_text='Thread colour, motif size, what to match.',
              validation={'max_length': 500}, when=has_work),
    ]
    if part_options:
        fields.insert(2, field('hand_work_parts', parts_label, 'multiselect',
                               options=part_options, when=has_work))
    return fields


HAND_WORK_MATERIALS = [
    material('hand_work_material', 'Work Materials (zari, stones, thread)', Inv.MAGGAM,
             when=one_of('hand_work', HAND_WORK_WANTED)),
]


#: Garments nobody embroiders: the hand-work question is not asked, and its
#: absence reads as "Without Work" everywhere the gate is checked.
NO_HAND_WORK = {'petticoat'}


def build(definition):
    sections = []
    for index, (key, title) in enumerate(SECTION_TITLES):
        fields = list(definition['sections'].get(key, []))
        # Hand work sits with the garment's own basics, right after its type,
        # and ahead of the common trial/urgency questions that fold away.
        if key == 'basic' and definition['key'] not in NO_HAND_WORK:
            fields = fields + hand_work_fields(definition)
        fields = fields + COMMON_BY_SECTION.get(key, [])
        if key == 'materials':
            fields = FABRIC_SOURCE + fields
            if definition['key'] not in NO_HAND_WORK:
                fields = fields + HAND_WORK_MATERIALS
        if key == 'measurements' and definition['key'] not in NO_HAND_WORK:
            fields = fields + COMMON_PATTERN
        sections.append({
            'key': key,
            'title': title,
            'sequence': index,
            'fields': fields,
        })
    return {
        'key': definition['key'],
        'name': definition['name'],
        'sequence': definition['sequence'],
        'design_parts': definition.get('design_parts', []),
        'sections': sections,
    }


def all_templates():
    return [build(d) for d in TEMPLATES]
