import re

from rest_framework import serializers

from core.validators import (
    MAX_NOTE, validate_amount, validate_email_address, validate_gstin, validate_hsn,
    validate_percentage, validate_phone, validate_quantity, validate_text,
)

from .models import (
    BillOfMaterials, BomLine, CatalogItem, CatalogSection, Category,
    CustomerMaterial, CustomerMaterialMovement, DEFAULT_UNIT_BY_CATEGORY,
    InventoryItem, ItemPlacement, LocationStock, OrderMaterialLine, OrderMaterialPlan,
    OrderPurchase, PurchaseOrder, PurchaseOrderLine, StockLocation, StockMovement, Supplier,
    Unit, UnitConversion, next_item_code,
)


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'

    def validate_name(self, value):
        return validate_text(value, label='Supplier name', max_length=150, required=True)

    def validate_contact_person(self, value):
        return validate_text(value, label='Contact person', max_length=150)

    def validate_phone(self, value):
        # A supplier's line is often a landline or an STD-coded office number.
        return validate_phone(value, max_length=30)

    def validate_email(self, value):
        return validate_email_address(value)

    def validate_gst_number(self, value):
        return validate_gstin(value)

    def validate_address(self, value):
        return validate_text(value, label='Address', max_length=MAX_NOTE)

    def validate_notes(self, value):
        return validate_text(value, label='Notes', max_length=MAX_NOTE)


class ItemPlacementSerializer(serializers.ModelSerializer):
    path = serializers.CharField(read_only=True)

    class Meta:
        model = ItemPlacement
        fields = ['id', 'garment', 'section', 'slot', 'path', 'image_urls']
        read_only_fields = ['id', 'path']

    def validate(self, data):
        from crm_api.fabric_taxonomy import TaxonomyError, validate_placement
        try:
            garment, section, slot = validate_placement(
                data.get('garment', ''), data.get('section', ''), data.get('slot', ''))
        except TaxonomyError as exc:
            raise serializers.ValidationError(str(exc))
        images = data.get('image_urls') or []
        if not isinstance(images, list):
            raise serializers.ValidationError({'image_urls': 'Expected a list of URLs.'})
        return {'garment': garment, 'section': section, 'slot': slot,
                'image_urls': [str(u) for u in images if u]}


class InventoryItemSerializer(serializers.ModelSerializer):
    available_stock = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)
    needs_reorder = serializers.BooleanField(read_only=True)
    is_out_of_stock = serializers.BooleanField(read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    placements = ItemPlacementSerializer(many=True, required=False)
    kind_label = serializers.SerializerMethodField()
    variant_label = serializers.SerializerMethodField()
    is_accessory = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = '__all__'
        read_only_fields = ['current_stock', 'reserved_stock', 'created_at', 'updated_at']
        # A row stocked from the catalogue or a design from the library gets
        # its code here, the way "Stock this" always gave it one; anything
        # else still has to bring its own.
        extra_kwargs = {'item_code': {'required': False, 'allow_blank': True}}

    def get_kind_label(self, obj):
        from crm_api.fabric_taxonomy import kind_label
        return kind_label(obj.kind)

    def get_variant_label(self, obj):
        from crm_api.fabric_taxonomy import variant_label
        return variant_label(obj.kind, obj.variant)

    def get_is_accessory(self, obj):
        from crm_api.fabric_taxonomy import is_accessory
        return is_accessory(obj.kind)

    def validate_color_hex(self, value):
        if value and not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
            raise serializers.ValidationError("Colour code must look like #1a2b3c.")
        return (value or '').lower()

    def validate_name(self, value):
        return validate_text(value, label='Item name', max_length=200, required=True)

    def validate_item_code(self, value):
        return validate_text(value, label='Item code', max_length=50)

    def validate_hsn_code(self, value):
        return validate_hsn(value)

    def validate_purchase_price(self, value):
        return validate_amount(value, label='Purchase price')

    def validate_selling_price(self, value):
        return validate_amount(value, label='Selling price')

    def validate_gst_percent(self, value):
        return validate_percentage(value, label='GST')

    def validate_minimum_stock(self, value):
        return validate_quantity(value, label='Minimum stock', allow_zero=True)

    def validate_maximum_stock(self, value):
        if value is None:
            return None
        return validate_quantity(value, label='Maximum stock', allow_zero=True)

    def validate_reorder_level(self, value):
        return validate_quantity(value, label='Reorder level', allow_zero=True)

    def validate(self, attrs):
        category = attrs.get('category') or getattr(self.instance, 'category', None)
        if category and not attrs.get('unit') and not self.instance:
            attrs['unit'] = DEFAULT_UNIT_BY_CATEGORY.get(category, Unit.UNIT)

        catalog_item = attrs.get('catalog_item')
        if catalog_item is not None and not self.instance:
            if not catalog_item.is_stockable:
                raise serializers.ValidationError({'catalog_item': (
                    f"'{catalog_item.name}' is a "
                    f"{catalog_item.get_item_type_display().lower()} and cannot hold stock.")})
            if InventoryItem.objects.filter(catalog_item=catalog_item).exists():
                raise serializers.ValidationError({'catalog_item': (
                    f"'{catalog_item.name}' is already in your inventory.")})
        design = attrs.get('design_asset')
        if design is not None and not self.instance:
            if InventoryItem.objects.filter(design_asset=design).exists():
                raise serializers.ValidationError({'design_asset': (
                    f"'{design.title}' is already in your inventory.")})
        if not self.instance and not attrs.get('item_code'):
            if catalog_item is not None:
                attrs['item_code'] = catalog_item.next_item_code()
            elif design is not None:
                attrs['item_code'] = next_item_code('DSN')
            else:
                # Not from the catalogue or the library: the quick sheet only
                # asks for a name, so the code is ours to issue here as well.
                attrs['item_code'] = next_item_code('ITM')

        # The card and the picker read image_url; the gallery is the rest of
        # the shoot. The first photo is mirrored so neither has to know the
        # other exists.
        urls = attrs.get('image_urls')
        if urls and not attrs.get('image_url'):
            attrs['image_url'] = urls[0]

        from crm_api.fabric_taxonomy import TaxonomyError, validate_kind
        if any(f in attrs for f in ('kind', 'variant')):
            kind = attrs.get('kind', getattr(self.instance, 'kind', '') or '')
            variant = attrs.get('variant', getattr(self.instance, 'variant', '') or '')
            try:
                attrs['kind'], attrs['variant'] = validate_kind(kind, variant)
            except TaxonomyError as exc:
                raise serializers.ValidationError({'kind': str(exc)})
        return attrs

    def _write_placements(self, item, rows):
        # Replace, not merge: the form sends the whole set it means to keep.
        wanted = {}
        for row in rows:
            wanted[(row['garment'], row['section'], row['slot'])] = row.get('image_urls') or []
        current = {(p.garment, p.section, p.slot): p for p in item.placements.all()}
        stale = [p.id for key, p in current.items() if key not in wanted]
        if stale:
            item.placements.filter(id__in=stale).delete()
        fresh, touched = [], []
        for (garment, section, slot), images in wanted.items():
            existing = current.get((garment, section, slot))
            if existing is None:
                fresh.append(ItemPlacement(
                    item=item, garment=garment, section=section, slot=slot,
                    image_urls=images))
            elif existing.image_urls != images:
                existing.image_urls = images
                touched.append(existing)
        if fresh:
            ItemPlacement.objects.bulk_create(fresh)
        if touched:
            ItemPlacement.objects.bulk_update(touched, ['image_urls'])

    def create(self, validated_data):
        rows = validated_data.pop('placements', [])
        item = super().create(validated_data)
        if rows:
            self._write_placements(item, rows)
        return item

    def update(self, instance, validated_data):
        rows = validated_data.pop('placements', None)
        item = super().update(instance, validated_data)
        if rows is not None:
            self._write_placements(item, rows)
        return item


class InventoryItemSummarySerializer(serializers.ModelSerializer):


    available_stock = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)
    needs_reorder = serializers.BooleanField(read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    placements = ItemPlacementSerializer(many=True, read_only=True)
    kind_label = serializers.SerializerMethodField()
    is_accessory = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = [
            'id', 'item_code', 'name', 'category', 'color', 'unit', 'unit_display',
            'current_stock', 'reserved_stock', 'available_stock', 'reorder_level',
            'needs_reorder', 'rack_location', 'status', 'purchase_price',
            # What the order wizard's fabric picker reads off each roll.
            'material_type', 'color_hex', 'image_url', 'image_urls', 'kind', 'variant',
            'kind_label', 'is_accessory', 'selling_price', 'placements',
        ]

    def get_kind_label(self, obj):
        from crm_api.fabric_taxonomy import kind_label
        return kind_label(obj.kind)

    def get_is_accessory(self, obj):
        from crm_api.fabric_taxonomy import is_accessory
        return is_accessory(obj.kind)


class StockMovementSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    movement_type_display = serializers.CharField(source='get_movement_type_display', read_only=True)
    order_reference = serializers.CharField(source='order.order_id', read_only=True)
    performed_by_name = serializers.CharField(source='performed_by.name', read_only=True)

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = [f.name for f in StockMovement._meta.fields]


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    quantity_outstanding = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = [
            'id', 'item', 'item_name', 'item_code', 'quantity_ordered',
            'quantity_received', 'quantity_outstanding', 'unit_cost',
            'line_total', 'batch_number',
        ]
        read_only_fields = ['quantity_received']

    def validate_quantity_ordered(self, value):
        return validate_quantity(value, label='Quantity ordered')

    def validate_unit_cost(self, value):
        return validate_amount(value, label='Unit cost')


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = PurchaseOrderLineSerializer(many=True, required=False)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = '__all__'
        read_only_fields = ['status', 'received_date', 'order_date']

    def validate_tax_amount(self, value):
        return validate_amount(value, label='Tax amount')

    def validate_invoice_number(self, value):
        return validate_text(value, label='Invoice number', max_length=100)

    def validate_notes(self, value):
        return validate_text(value, label='Notes', max_length=MAX_NOTE)

    def create(self, validated_data):
        lines = validated_data.pop('lines', [])
        purchase_order = PurchaseOrder.objects.create(**validated_data)
        for line in lines:
            PurchaseOrderLine.objects.create(purchase_order=purchase_order, **line)
        return purchase_order

    def update(self, instance, validated_data):
        validated_data.pop('lines', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class CatalogItemSerializer(serializers.ModelSerializer):


    section_name = serializers.CharField(source='section.name', read_only=True)
    section_full_name = serializers.CharField(source='section.full_name', read_only=True)
    subsection = serializers.CharField(source='section.subsection', read_only=True)
    doc = serializers.CharField(source='section.doc', read_only=True)
    item_type_display = serializers.CharField(source='get_item_type_display', read_only=True)
    is_stockable = serializers.BooleanField(read_only=True)
    stocked_item_id = serializers.SerializerMethodField()

    class Meta:
        model = CatalogItem
        fields = [
            'id', 'name', 'item_type', 'item_type_display', 'default_unit',
            'legacy_category', 'is_active', 'is_stockable',
            'doc', 'section', 'section_name', 'subsection', 'section_full_name', 'stocked_item_id',
        ]

    def get_stocked_item_id(self, obj):
        existing = getattr(obj, 'stocked_as', None)
        if existing is None:
            return None
        row = existing.all()[:1]
        return str(row[0].id) if row else None


class CatalogSectionSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    doc_display = serializers.CharField(source='get_doc_display', read_only=True)
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CatalogSection
        fields = ['id', 'doc', 'doc_display', 'sequence', 'name', 'subsection',
                  'full_name', 'item_count']


class StockLocationSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    tailor_name = serializers.CharField(source='tailor.name', read_only=True, default=None)

    class Meta:
        model = StockLocation
        fields = ['id', 'name', 'kind', 'kind_display', 'is_default', 'is_active',
                  'sequence', 'tailor', 'tailor_name']


class LocationStockSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    location_kind = serializers.CharField(source='location.kind', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    unit_display = serializers.CharField(source='item.get_unit_display', read_only=True)

    class Meta:
        model = LocationStock
        fields = ['id', 'item', 'item_name', 'item_code', 'location', 'location_name',
                  'location_kind', 'quantity', 'unit_display', 'updated_at']


class UnitConversionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitConversion
        fields = ['id', 'item', 'from_unit', 'to_unit', 'factor']


class BomLineSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)

    class Meta:
        model = BomLine
        fields = [
            'id', 'bom', 'role', 'role_display', 'inventory_item', 'catalog_item',
            'description', 'material_name', 'quantity', 'quantity_formula', 'unit',
            'unit_display', 'waste_percent', 'is_optional', 'is_customer_supplied',
            'sequence', 'notes',
        ]

    def validate(self, attrs):
        from .formula import FormulaError, validate_syntax

        merged = {**({} if self.instance is None else {
            'inventory_item': self.instance.inventory_item,
            'catalog_item': self.instance.catalog_item,
            'is_customer_supplied': self.instance.is_customer_supplied,
        }), **attrs}

        if not (merged.get('inventory_item') or merged.get('catalog_item')
                or merged.get('is_customer_supplied')):
            raise serializers.ValidationError(
                'A line must name an inventory item, a catalogue item, or be '
                'marked as customer-supplied.')

        catalog_item = merged.get('catalog_item')
        if catalog_item is not None and not catalog_item.is_stockable:
            raise serializers.ValidationError({'catalog_item': (
                f"'{catalog_item.name}' is a "
                f"{catalog_item.get_item_type_display().lower()} and cannot be "
                f"used as a material.")})

        formula = attrs.get('quantity_formula')
        if formula:
            try:
                validate_syntax(formula)
            except FormulaError as exc:
                raise serializers.ValidationError({'quantity_formula': str(exc)})
        return attrs


class BomLineInSerializer(BomLineSerializer):
    """A line as it arrives inside its recipe: the recipe is the parent."""

    class Meta(BomLineSerializer.Meta):
        extra_kwargs = {'bom': {'required': False}}


class BillOfMaterialsSerializer(serializers.ModelSerializer):
    # Writable: the cookbook sheet saves a recipe and every material in one
    # request. Lines sent on an update replace the recipe's lines; an update
    # that leaves them out touches only the recipe's own fields.
    lines = BomLineInSerializer(many=True, required=False)
    template_name = serializers.CharField(source='template.name', read_only=True, default=None)
    line_count = serializers.IntegerField(source='lines.count', read_only=True)

    class Meta:
        model = BillOfMaterials
        fields = ['id', 'name', 'template', 'template_name', 'design', 'version',
                  'is_active', 'notes', 'lines', 'line_count', 'created_at', 'updated_at']
        read_only_fields = ['version']

    def _write_lines(self, bom, lines):
        bom.lines.all().delete()
        for sequence, line in enumerate(lines):
            line.pop('bom', None)
            BomLine.objects.create(bom=bom, sequence=sequence, **line)

    def create(self, validated):
        lines = validated.pop('lines', None)
        bom = super().create(validated)
        if lines:
            self._write_lines(bom, lines)
        return bom

    def update(self, bom, validated):
        lines = validated.pop('lines', None)
        bom = super().update(bom, validated)
        if lines is not None:
            self._write_lines(bom, lines)
        return bom

    def validate(self, attrs):
        merged = {**({} if self.instance is None else {
            'name': self.instance.name,
            'template': self.instance.template,
            'design': self.instance.design,
        }), **attrs}

        version = getattr(self.instance, 'version', 1)
        clash = BillOfMaterials.objects.filter(
            template=merged.get('template'), design=merged.get('design'),
            version=version)
        if merged.get('template') is None and merged.get('design') is None:
            clash = clash.filter(name=merged.get('name'))
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(
                {'version': f'A version {version} of this recipe already exists.'})
        return attrs


class OrderMaterialLineSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    outstanding_reservation = serializers.DecimalField(
        max_digits=12, decimal_places=3, read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True, default=None)
    garment_name = serializers.CharField(source='garment_job.template.name', read_only=True, default=None)
    available_stock = serializers.DecimalField(
        source='item.available_stock', max_digits=12, decimal_places=3,
        read_only=True, default=None)

    class Meta:
        model = OrderMaterialLine
        fields = [
            'id', 'plan', 'bom_line', 'item', 'item_code', 'garment_name', 'role', 'role_display',
            'material_name', 'unit', 'unit_display', 'required_quantity',
            'reserved_quantity', 'consumed_quantity', 'wasted_quantity',
            'returned_quantity', 'outstanding_reservation', 'available_stock',
            'is_customer_supplied',
            'gathered_at', 'gathered_by_name', 'photos', 'sequence',
        ]
        read_only_fields = fields


class OrderMaterialPlanSerializer(serializers.ModelSerializer):
    lines = OrderMaterialLineSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    order_code = serializers.CharField(source='order.order_id', read_only=True)
    bom_name = serializers.CharField(source='bom.name', read_only=True)

    class Meta:
        model = OrderMaterialPlan
        fields = ['id', 'order', 'order_code', 'bom', 'bom_name', 'bom_version',
                  'status', 'status_display', 'variables', 'packaging_deducted_at',
                  'lines', 'created_at', 'updated_at']
        read_only_fields = fields


class CustomerMaterialMovementSerializer(serializers.ModelSerializer):
    movement_type_display = serializers.CharField(
        source='get_movement_type_display', read_only=True)

    class Meta:
        model = CustomerMaterialMovement
        fields = ['id', 'material', 'movement_type', 'movement_type_display', 'quantity',
                  'previous_remaining', 'new_remaining', 'user_name_snapshot',
                  'remarks', 'created_at']
        read_only_fields = fields


class OrderPurchaseSerializer(serializers.ModelSerializer):
    remaining_quantity = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    order_code = serializers.CharField(source='order.order_id', read_only=True)
    order_reference = serializers.CharField(source='order.reference', read_only=True)
    customer_name = serializers.SerializerMethodField()
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default=None)

    class Meta:
        model = OrderPurchase
        fields = ['id', 'order', 'order_code', 'order_reference', 'customer_name', 'garment_job',
                  'garment_name', 'field_key', 'name', 'notes', 'quantity', 'unit', 'unit_display',
                  'estimated_cost', 'actual_cost', 'supplier', 'supplier_name', 'invoice_reference',
                  'status', 'status_display', 'required_by', 'purchased_at', 'received_at',
                  'received_quantity', 'used_quantity', 'remaining_quantity', 'created_at']
        # What was bought is written by the purchase steps, not edited in place.
        read_only_fields = ['order', 'garment_job', 'garment_name', 'field_key', 'actual_cost',
                            'supplier', 'invoice_reference', 'status', 'purchased_at',
                            'received_at', 'received_quantity', 'used_quantity', 'created_at']

    def get_customer_name(self, obj):
        c = obj.order.customer
        return f"{c.first_name} {c.last_name}".strip()

    def validate_name(self, value):
        return validate_text(value, label='Item', max_length=200, required=True)

    def validate_notes(self, value):
        return validate_text(value, label='Notes', max_length=MAX_NOTE) or ''

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('Quantity must be greater than zero.')
        return value

    def validate_estimated_cost(self, value):
        if value < 0:
            raise serializers.ValidationError('Estimated cost cannot be negative.')
        return value


class CustomerMaterialSerializer(serializers.ModelSerializer):
    remaining_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=3, read_only=True)
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    order_code = serializers.CharField(source='order.order_id', read_only=True)

    class Meta:
        model = CustomerMaterial
        fields = ['id', 'order', 'order_code', 'kind', 'kind_display', 'name',
                  'description', 'unit', 'unit_display', 'received_quantity',
                  'used_quantity', 'returned_quantity', 'damaged_quantity',
                  'remaining_quantity', 'received_at', 'notes']
        read_only_fields = ['received_quantity', 'used_quantity', 'returned_quantity',
                            'damaged_quantity', 'remaining_quantity', 'received_at']

    def validate_name(self, value):
        return validate_text(value, label='Material name', max_length=200, required=True)

    def validate_description(self, value):
        return validate_text(value, label='Description', max_length=MAX_NOTE)

    def validate_notes(self, value):
        return validate_text(value, label='Notes', max_length=MAX_NOTE)
