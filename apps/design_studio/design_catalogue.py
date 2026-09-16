"""The design catalogue: garment -> category -> (sub-category ->) design option.

One source of truth, the way `crm_api.fabric_taxonomy` is for fabrics: the API
serves this tree to the browser, and the serializer validates an upload's
catalogue path against it. Garment keys are GarmentTemplate.key values, so the
catalogue for a garment is found the same way everything else about it is.

A category is one DIMENSION of the garment -- what it is, what it is made of,
where it comes from, what is worked on it, the occasion, how it is draped --
and the dimensions are deliberately kept apart. The same name recurring in two
of them ("Ruffle Saree" as a fashion design and as a party saree) is two
positions, addressed by their full path, not one entry to be de-duplicated.

Keys are slugs of the labels, unique within their own category or
sub-category. They are what an uploaded design stores; the labels are what
the boutique reads.

Adding a garment is adding a top-level entry here. Nothing else changes.
"""

import re


def _slug(label):
    return re.sub(r'[^a-z0-9]+', '_', str(label).lower()).strip('_')


def _options(*labels):
    """Labels in, [{"key", "label"}] out, in the order given. A label that
    repeats within one list would collide on key; the catalogue is written so
    that never happens, and this makes it an error rather than a silent loss."""
    out, seen = [], set()
    for label in labels:
        key = _slug(label)
        if key in seen:
            raise ValueError(f'duplicate design option in one list: {label!r}')
        seen.add(key)
        out.append({'key': key, 'label': label})
    return out


def _category(label, short=None, options=None, subcategories=None, note=''):
    cat = {'key': _slug(label), 'label': label, 'short': short or label}
    if note:
        cat['note'] = note
    if subcategories is not None:
        cat['subcategories'] = [
            {'key': _slug(sub_label), 'label': sub_label, 'options': _options(*sub_options)}
            for sub_label, sub_options in subcategories
        ]
    else:
        cat['options'] = _options(*(options or ()))
    return cat


# --------------------------------------------------------------------------
# SAREE
# --------------------------------------------------------------------------

_SAREE_CATEGORIES = [
    _category(
        'Contemporary / Fashion Saree Designs', short='Contemporary / Fashion',
        options=[
            'Ruffle Saree', 'Dhoti Saree', 'Pre-Draped Saree', 'Pant Saree', 'Saree Gown',
            'Lehenga Saree', 'Half-Saree Style', 'Concept Saree', 'Belted Saree', 'Cape Saree',
            'Jacket Saree', 'Co-ord Saree', 'Skirt Saree', 'Trouser Saree', 'Dhoti-Pant Saree',
            'Draped Saree', 'Layered Saree', 'Double-Drape Saree', 'Front-Pallu Saree',
            'Side-Drape Saree', 'Scarf-Style Saree', 'Cowl-Drape Saree', 'Mermaid Saree',
            'Fish-Cut Saree', 'Tulip Saree', 'Asymmetric Saree', 'Pre-Pleated Saree',
            'Ready-to-Wear Saree', 'Easy-Drape Saree', 'Saree with Attached Pallu',
            'Saree with Attached Petticoat',
        ]),
    _category(
        'Traditional Indian Saree Types', short='Traditional Indian',
        subcategories=[
            ('Silk / Pattu', [
                'Kanjeevaram / Kanchipuram Pattu', 'Banarasi Silk', 'Mysore Silk', 'Uppada Silk',
                'Gadwal Silk', 'Dharmavaram Silk', 'Pochampally Silk', 'Chettinad Silk',
                'Konrad Silk', 'Tussar Silk', 'Matka Silk', 'Raw Silk', 'Organza Silk',
                'Chanderi Silk', 'Maheshwari Silk', 'Paithani', 'Ilkal Saree', 'Muga Silk',
                'Assam Silk', 'Baluchari', 'Murshidabad Silk',
            ]),
            ('Cotton', [
                'Mangalagiri Cotton', 'Kalamkari Cotton', 'Chettinad Cotton', 'Bengal Cotton',
                'Tant Saree', 'Kota Cotton', 'Kota Doria', 'Chanderi Cotton', 'Maheshwari Cotton',
                'Mulmul Cotton', 'Handloom Cotton', 'Venkatagiri Cotton', 'Narayanpet Cotton',
                'Sambalpuri Cotton',
            ]),
        ]),
    _category(
        'Regional / Heritage Sarees', short='Regional / Heritage',
        subcategories=[
            ('Telangana & Andhra', [
                'Pochampally Ikat', 'Gadwal', 'Narayanpet', 'Uppada', 'Dharmavaram', 'Mangalagiri',
                'Venkatagiri', 'Kalamkari Saree', 'Siddipet Gollabhama Saree',
            ]),
            ('Tamil Nadu', [
                'Kanjeevaram', 'Chettinad', 'Madurai Sungudi', 'Coimbatore Cotton', 'Arani Silk',
                'Dharmavaram-style Silk',
            ]),
            ('Karnataka', ['Mysore Silk', 'Ilkal', 'Molakalmuru', 'Karnataka Cotton']),
            ('Maharashtra', ['Paithani', 'Narayan Peth', 'Kolhapuri Saree']),
            ('Gujarat', ['Patola', 'Bandhani', 'Gharchola', 'Ajrakh Saree', 'Mashru-inspired Sarees']),
            ('Rajasthan', ['Bandhani', 'Leheriya', 'Kota Doria', 'Bagru-inspired Sarees']),
            ('West Bengal', [
                'Tant', 'Jamdani', 'Garad', 'Baluchari', 'Dhakai Jamdani', 'Tussar', 'Kantha Saree',
            ]),
            ('Odisha', ['Sambalpuri', 'Bomkai', 'Berhampuri', 'Khandua', 'Pasapalli']),
            ('Kerala', ['Kasavu', 'Kerala Cotton', 'Set Mundu-inspired Saree']),
            ('Assam', ['Muga Silk', 'Mekhela Chador', 'Assam Silk']),
        ]),
    _category(
        'Fabric-Based Saree Designs', short='Fabric-Based',
        options=[
            'Silk Saree', 'Cotton Saree', 'Linen Saree', 'Chiffon Saree', 'Georgette Saree',
            'Crepe Saree', 'Organza Saree', 'Net Saree', 'Satin Saree', 'Velvet Saree',
            'Tissue Saree', 'Modal Silk Saree', 'Art Silk Saree', 'Raw Silk Saree', 'Tussar Saree',
            'Muslin Saree', 'Rayon Saree', 'Viscose Saree', 'Chanderi Saree', 'Kota Doria',
            'Handloom Saree', 'Khadi Saree', 'Denim Saree', 'Faux Georgette',
        ]),
    _category(
        'Embroidery / Surface Design Sarees', short='Embroidery / Surface Design',
        options=[
            'Zari Saree', 'Zardozi Saree', 'Aari Work Saree', 'Chikankari Saree', 'Kantha Saree',
            'Phulkari Saree', 'Mirror Work Saree', 'Sequin Saree', 'Cutdana Saree',
            'Beadwork Saree', 'Pearl Work Saree', 'Resham Work Saree', 'Thread Embroidery Saree',
            'Appliqué Saree', 'Patchwork Saree', 'Stone Work Saree', 'Crystal Work Saree',
            'Gota Patti Saree', 'Dabka Work Saree', 'Kasab Work Saree', 'Mukaish Saree',
        ]),
    _category(
        'Print / Weave-Based Designs', short='Print / Weave',
        options=[
            'Floral Print Saree', 'Digital Print Saree', 'Abstract Print Saree',
            'Geometric Print Saree', 'Animal Print Saree', 'Paisley Print Saree',
            'Kalamkari Saree', 'Ajrakh Saree', 'Block Print Saree', 'Bagru Print Saree',
            'Dabu Print Saree', 'Ikat Saree', 'Bandhani Saree', 'Leheriya Saree', 'Shibori Saree',
            'Tie-Dye Saree', 'Jamdani Saree', 'Chikankari Saree', 'Woven Saree', 'Brocade Saree',
            'Jacquard Saree', 'Striped Saree', 'Checked Saree', 'Polka Dot Saree',
        ]),
    _category(
        'Occasion-Based Sarees', short='Occasion',
        subcategories=[
            ('Wedding', [
                'Bridal Silk Saree', 'Kanjeevaram Bridal Saree', 'Banarasi Bridal Saree',
                'Paithani Bridal Saree', 'Bridal Designer Saree', 'Heavy Zari Saree',
            ]),
            ('Party', [
                'Sequin Saree', 'Shimmer Saree', 'Metallic Saree', 'Pre-Draped Saree',
                'Ruffle Saree', 'Organza Saree', 'Satin Saree', 'Crystal Saree',
            ]),
            ('Office', [
                'Linen Saree', 'Cotton Saree', 'Handloom Saree', 'Chanderi Saree',
                'Minimal Silk Saree',
            ]),
            ('Festive', [
                'Pattu Saree', 'Banarasi', 'Paithani', 'Gadwal', 'Pochampally', 'Bandhani', 'Kasavu',
            ]),
            ('Cocktail / Modern', [
                'Pant Saree', 'Dhoti Saree', 'Saree Gown', 'Ruffle Saree', 'Belted Saree',
                'Cape Saree', 'Jacket Saree',
            ]),
        ]),
    _category(
        'Draping Styles', short='Draping Styles',
        note='Ways of draping a saree, not separate saree products.',
        options=[
            'Nivi Draping', 'Bengali Draping', 'Gujarati Draping', 'Maharashtrian / Nauvari Draping',
            'Tamilian Draping', 'Kodagu Draping', 'Kerala Draping', 'Madisaru Draping',
            'Coorgi Draping', 'Assamese Draping', 'Atpourey Draping', 'Nauvari Dhoti Draping',
            'Seedha Pallu', 'Ulta Pallu', 'Front Pallu', 'Open Pallu', 'Pleated Pallu',
            'Belted Draping', 'Dhoti Draping', 'Pant Draping',
        ]),
    _category(
        'Special / Modern Saree Constructions', short='Special / Modern',
        options=[
            'Pre-Pleated Saree', 'Pre-Stitched Saree', 'Pre-Draped Saree', 'Ready-to-Wear Saree',
            'Saree with Skirt', 'Saree with Pants', 'Saree with Petticoat', 'Saree with Shapewear',
            'Saree with Built-in Shapewear', 'Saree with Belt', 'Saree with Jacket',
            'Saree with Cape', 'Saree with Blazer', 'Saree with Corset Blouse',
            'Saree with Crop Top', 'Saree with Peplum Blouse', 'Saree with Shirt',
            'Saree with Long Jacket', 'Saree with Detachable Pallu',
        ]),
    # The blouse is a component of the saree catalogue, not another garment.
    # Its dimensions are declared so the shape is settled and a design can
    # already be filed under one; the options within each arrive with the
    # blouse catalogue and are added here, nothing else changing.
    _category(
        'Blouse', short='Blouse',
        note='Blouse design options will be added per dimension.',
        subcategories=[
            ('Neck design', []), ('Sleeve design', []), ('Back design', []), ('Front design', []),
            ('Collar', []), ('Cuff', []), ('Blouse silhouette', []), ('Blouse construction', []),
            ('Blouse embellishment', []),
        ]),
    _category(
        'Petticoat', short='Petticoat',
        options=[
            'Regular Petticoat', 'Mermaid Petticoat', 'Fish-Cut Petticoat', 'Shapewear Petticoat',
            'Can-Can Petticoat',
        ]),
]

# --------------------------------------------------------------------------
# BLOUSE -- cutting and pattern construction, not necklines
# --------------------------------------------------------------------------
#
# What the tailor cuts: darts, katori, princess seams, panels, yokes, the back,
# the armhole. Neckline styles are a different dimension of a blouse and are
# deliberately not here. The Blouse Cut Master at the end is the simplified
# family view for the workroom; the nine detailed categories are the full
# catalogue. A name appearing in both ("Shoulder Princess") is two positions,
# addressed by their paths, as everywhere else in this file.

_BLOUSE_CATEGORIES = [
    _category(
        'Main Blouse Cutting / Pattern Types', short='Main Cutting / Pattern',
        options=[
            'Katori Cutting', 'Princess Cutting', 'Princess Dart', 'Waist Dart', 'Side Dart',
            'Shoulder Dart', 'Bust Dart', 'French Dart', 'Armhole Dart', 'Centre Front Dart',
            'Centre Back Dart', 'Double Dart', 'Single Dart', 'Panel Cutting', '4-Panel Cutting',
            '6-Panel Cutting', '8-Panel Cutting', 'Centre Panel Cutting', 'Side Panel Cutting',
            'Vertical Panel Cutting', 'Horizontal Panel Cutting',
        ]),
    _category(
        'Traditional Blouse Construction Cuts', short='Traditional Construction',
        options=[
            'Katori Blouse', 'Katori Panel Cutting', 'Katori + Princess Combination',
            'Princess Panel Blouse', 'Princess Seam Blouse', 'Princess Cut from Armhole',
            'Princess Cut from Shoulder', 'Princess Cut from Neck',
            'Princess Cut from Armhole to Waist', 'Side Panel Blouse', 'Centre Panel Blouse',
            'Multi-Panel Blouse', 'Darted Blouse', 'Panel-and-Dart Blouse',
        ]),
    _category(
        'Bust-Fitting Cuts', short='Bust-Fitting',
        options=[
            'Single Bust Dart', 'Double Bust Dart', 'Vertical Bust Dart', 'Horizontal Bust Dart',
            'Diagonal Bust Dart', 'Under-Bust Dart', 'Side Bust Dart', 'Shoulder Bust Dart',
            'Waist Bust Dart', 'French Dart',
        ]),
    _category(
        'Designer / Advanced Cuts', short='Designer / Advanced',
        options=[
            'Princess Seam', 'Princess Panel', 'Empire Cut', 'Empire Waist Blouse', 'Yoke Cutting',
            'Yoke + Panel Cutting', 'Yoke + Katori Cutting', 'Peplum Cut', 'Corset Panel Cutting',
            'Corset Seam', 'Bustier Panel Cutting', 'Contour Cutting', 'Curved Panel Cutting',
            'Asymmetric Panel Cutting', 'Diagonal Panel Cutting', 'Cross Panel Cutting',
            'V-Panel Cutting', 'U-Panel Cutting', 'Geometric Panel Cutting', 'Cut-and-Join Blouse',
        ]),
    _category(
        'Katori Variations', short='Katori',
        options=[
            'Single Katori', 'Double Katori', '2-Piece Katori', '3-Piece Katori', '4-Piece Katori',
            'Full Katori', 'Half Katori', 'Round Katori', 'Curved Katori', 'Pointed Katori',
            'Deep Katori', 'Katori with Princess Seam', 'Katori with Waist Dart',
            'Katori with Side Panel', 'Katori with Yoke', 'Katori Corset',
        ]),
    _category(
        'Princess-Cut Variations', short='Princess-Cut',
        options=[
            'Shoulder Princess', 'Armhole Princess', 'Neck Princess', 'Centre Princess',
            'Side Princess', 'Full Princess', 'Half Princess', 'Princess with Katori',
            'Princess with Yoke', 'Princess with Panel', 'Princess with Dart', 'Princess Corset',
            'Princess Peplum',
        ]),
    _category(
        'Blouse Back Construction Cuts', short='Back Construction',
        options=[
            'Back Princess', 'Back Dart', 'Back Panel', 'Centre Back Seam', 'Centre Back Opening',
            'Back Yoke', 'Back Katori', 'Back V-Panel', 'Back U-Panel', 'Back Keyhole Panel',
            'Back Corset Panel', 'Back Lace-Up Panel', 'Back Cut-Out Panel',
        ]),
    _category(
        'Sleeve Attachment / Armhole Cuts', short='Sleeve / Armhole',
        options=[
            'Normal Armhole', 'Deep Armhole', 'High Armhole', 'Round Armhole', 'Square Armhole',
            'Princess Armhole', 'Cut-In Armhole', 'Raglan Sleeve Cut', 'Kimono Sleeve Cut',
            'Dolman Sleeve Cut', 'Extended Shoulder Cut', 'Cap Sleeve Cut', 'Puff Sleeve Cut',
            'Petal Sleeve Cut', 'Bell Sleeve Cut',
        ]),
    _category(
        'Yoke Cuts', short='Yoke',
        options=[
            'Round Yoke', 'Square Yoke', 'V-Yoke', 'U-Yoke', 'Straight Yoke', 'Curved Yoke',
            'Deep Yoke', 'High Yoke', 'Front Yoke', 'Back Yoke', 'Full Yoke', 'Half Yoke',
            'Shoulder Yoke', 'Neck Yoke', 'Embroidered Yoke', 'Transparent Yoke',
        ]),
    _category(
        'Blouse Cut Master', short='Cut Master',
        note='The primary cutting families, simplified for the workroom.',
        subcategories=[
            ('Dart Cut', ['Single Dart', 'Double Dart', 'French Dart', 'Bust Dart', 'Waist Dart',
                          'Shoulder Dart']),
            ('Katori Cut', ['2-Piece', '3-Piece', '4-Piece', 'Katori + Dart', 'Katori + Princess']),
            ('Princess Cut', ['Shoulder Princess', 'Armhole Princess', 'Neck Princess',
                              'Centre Princess', 'Princess Panel']),
            ('Panel Cut', ['2 Panel', '4 Panel', '6 Panel', '8 Panel', 'Centre Panel', 'Side Panel',
                           'Diagonal Panel']),
            ('Yoke Cut', ['Round', 'Square', 'V', 'U', 'Curved', 'Deep']),
            ('Designer Construction', ['Corset', 'Bustier', 'Empire', 'Peplum', 'Asymmetric',
                                       'Geometric', 'Draped']),
        ]),
]

# --------------------------------------------------------------------------
# LEHENGA -- silhouette and construction
# --------------------------------------------------------------------------
#
# Eleven dimensions of how a lehenga is built and looks, then the Lehenga
# Design Master: the structured attributes a cutting master reads (silhouette,
# kali count, pleat type, flare, waist, hem...). The detailed categories are
# for filing design photographs; the master is the attribute vocabulary. The
# same idea appears in both ("16-Kali Lehenga" and Kali Count > "16 Kali") and
# in more than one detail category ("Dhoti Lehenga" is both a draped style and
# a designer cut) -- every one is its own position, by its path.
#
# Kali counts are separate options on purpose: the number of panels is the
# construction, and "Kali Lehenga" alone would lose it.

_LEHENGA_CATEGORIES = [
    _category(
        'Basic Lehenga Silhouettes', short='Basic Silhouettes',
        options=[
            'Flared Lehenga', 'A-Line Lehenga', 'Straight-Cut Lehenga', 'Circular Lehenga',
            'Semi-Circular Lehenga', 'Full-Circular Lehenga', 'Kali Lehenga', 'Panelled Lehenga',
            'Mermaid Lehenga', 'Fish-Cut Lehenga', 'Trumpet Lehenga', 'Fishtail Lehenga',
            'Tiered Lehenga', 'Layered Lehenga', 'Umbrella Lehenga', 'Sharara-Style Lehenga',
            'Skirt-Style Lehenga', 'Maxi Lehenga', 'Floor-Length Lehenga', 'Short Lehenga',
            'Knee-Length Lehenga',
        ]),
    _category(
        'Pleated Lehenga Styles', short='Pleated',
        options=[
            'Pattu Pleated Lehenga', 'Knife-Pleated Lehenga', 'Box-Pleated Lehenga',
            'Accordion-Pleated Lehenga', 'Sunray Pleated Lehenga', 'Fine-Pleated Lehenga',
            'Broad-Pleated Lehenga', 'Front Pleated Lehenga', 'Side Pleated Lehenga',
            'All-Around Pleated Lehenga', 'Structured Pleated Lehenga', 'Draped Pleated Lehenga',
            'Layered Pleated Lehenga', 'Pleated Panel Lehenga',
        ]),
    _category(
        'Kali / Panel Construction', short='Kali / Panel',
        options=[
            '4-Kali Lehenga', '6-Kali Lehenga', '8-Kali Lehenga', '10-Kali Lehenga',
            '12-Kali Lehenga', '16-Kali Lehenga', '20-Kali Lehenga', '24-Kali Lehenga',
            '32-Kali Lehenga', 'Multi-Kali Lehenga', 'Broad-Kali Lehenga', 'Narrow-Kali Lehenga',
            'Alternating-Kali Lehenga', 'Contrast-Kali Lehenga', 'Embroidered-Kali Lehenga',
        ]),
    _category(
        'Ruffle & Layered Styles', short='Ruffle & Layered',
        options=[
            'Ruffled Lehenga', 'Single-Ruffle Lehenga', 'Double-Ruffle Lehenga',
            'Multi-Ruffle Lehenga', 'Tiered Ruffle Lehenga', 'Cascading Ruffle Lehenga',
            'Asymmetric Ruffle Lehenga', 'Ruffle-Panel Lehenga', 'Layered Lehenga',
            'Double-Layer Lehenga', 'Triple-Layer Lehenga', 'Multi-Tier Lehenga', 'Tiered Lehenga',
            'Frill Lehenga', 'Flounce Lehenga', 'Scalloped Layer Lehenga',
        ]),
    _category(
        'Draped Lehenga Styles', short='Draped',
        options=[
            'Draped Lehenga', 'Pre-Draped Lehenga', 'Saree-Style Lehenga', 'Dhoti Lehenga',
            'Draped Skirt Lehenga', 'Cowl Draped Lehenga', 'Front-Draped Lehenga',
            'Side-Draped Lehenga', 'Asymmetric Draped Lehenga', 'Wrap Lehenga',
            'Wrap-Around Lehenga', 'Panel-Draped Lehenga',
        ]),
    _category(
        'Modern / Designer Lehenga Cuts', short='Modern / Designer',
        options=[
            'Asymmetric Lehenga', 'High-Low Lehenga', 'Slit Lehenga', 'Front-Slit Lehenga',
            'Side-Slit Lehenga', 'Double-Slit Lehenga', 'Cut-Out Lehenga', 'Peplum Lehenga',
            'Corset Lehenga', 'Bustier Lehenga', 'Jacket Lehenga', 'Cape Lehenga', 'Pant Lehenga',
            'Dhoti Lehenga', 'Skirt Lehenga', 'Lehenga Gown', 'Lehenga Saree',
            'Indo-Western Lehenga', 'Fusion Lehenga', 'Co-Ord Lehenga', 'Layered Skirt Lehenga',
        ]),
    _category(
        'Traditional / Bridal Lehenga Styles', short='Traditional / Bridal',
        options=[
            'Bridal Lehenga', 'Bridal Circular Lehenga', 'Bridal Kali Lehenga',
            'Bridal A-Line Lehenga', 'Bridal Flared Lehenga', 'Pattu Lehenga',
            'Pattu Pavadai-Style Lehenga', 'Banarasi Lehenga', 'Brocade Lehenga', 'Zari Lehenga',
            'Gota Patti Lehenga', 'Rajasthani Lehenga', 'Gujarati Lehenga', 'Rajputi Lehenga',
            'Punjabi Lehenga', 'Mughal-Style Lehenga', 'Temple-Style Lehenga', 'Heritage Lehenga',
        ]),
    _category(
        'Fabric-Based Lehenga Styles', short='Fabric-Based',
        options=[
            'Pattu / Silk Lehenga', 'Kanjeevaram Silk Lehenga', 'Banarasi Silk Lehenga',
            'Raw Silk Lehenga', 'Tussar Silk Lehenga', 'Velvet Lehenga', 'Organza Lehenga',
            'Georgette Lehenga', 'Chiffon Lehenga', 'Net Lehenga', 'Tissue Lehenga',
            'Satin Lehenga', 'Crepe Lehenga', 'Brocade Lehenga', 'Chanderi Lehenga',
            'Linen Lehenga', 'Cotton Lehenga', 'Jacquard Lehenga',
        ]),
    _category(
        'Volume / Flare Classification', short='Volume / Flare',
        options=[
            'Low-Flare Lehenga', 'Medium-Flare Lehenga', 'High-Flare Lehenga',
            'Extra-Flare Lehenga', 'Circular Flare', 'Umbrella Flare', 'Structured Flare',
            'Soft Flare', 'Stiff Flare', 'Layered Flare', 'Panelled Flare', 'Graduated Flare',
            'Mermaid Flare', 'Trumpet Flare',
        ]),
    _category(
        'Waist Construction', short='Waist',
        options=[
            'Normal Waist Lehenga', 'High-Waist Lehenga', 'Mid-Waist Lehenga', 'Low-Waist Lehenga',
            'Elastic Waist', 'Hook Waist', 'Zip Waist', 'Side-Zip Waist', 'Front-Opening Waist',
            'Lace-Up Waist', 'Tie-Up Waist', 'Corset Waist', 'Belted Waist', 'Drawstring Waist',
        ]),
    _category(
        'Lehenga Border / Hem Styles', short='Border / Hem',
        options=[
            'Plain Hem', 'Zari Border', 'Contrast Border', 'Broad Border', 'Narrow Border',
            'Double Border', 'Triple Border', 'Embroidered Border', 'Scalloped Hem', 'Wave Hem',
            'Lace Hem', 'Ruffle Hem', 'Fringe Hem', 'Tassel Hem', 'Cutwork Hem', 'Gota Border',
            'Piping Hem',
        ]),
    _category(
        'Lehenga Design Master', short='Design Master',
        note='The structured construction attributes a cutting master reads.',
        subcategories=[
            ('Silhouette', ['A-Line', 'Flared', 'Mermaid', 'Straight', 'Circular', 'Semi-Circular',
                            'Full-Circular', 'Trumpet', 'Fishtail', 'Tiered', 'Layered', 'Umbrella']),
            ('Construction', ['Kali', 'Panelled', 'Circular', 'Tiered', 'Layered']),
            ('Kali Count', ['4 Kali', '6 Kali', '8 Kali', '10 Kali', '12 Kali', '16 Kali', '20 Kali',
                            '24 Kali', '32 Kali', 'Multi-Kali']),
            ('Pleat Type', ['Pattu', 'Knife', 'Box', 'Accordion', 'Sunray', 'Fine', 'Broad', 'Front',
                            'Side', 'All-Around', 'Structured', 'Draped', 'Layered', 'Pleated Panel']),
            ('Flare', ['Low', 'Medium', 'High', 'Extra', 'Circular', 'Umbrella', 'Structured', 'Soft',
                       'Stiff', 'Layered', 'Panelled', 'Graduated', 'Mermaid', 'Trumpet']),
            ('Layer', ['Single', 'Double', 'Triple', 'Multi']),
            ('Ruffle', ['None', 'Single', 'Double', 'Multi', 'Tiered', 'Cascading', 'Asymmetric',
                        'Panel']),
            ('Drape', ['Normal', 'Draped', 'Pre-Draped', 'Saree-Style', 'Dhoti', 'Cowl',
                       'Front-Draped', 'Side-Draped', 'Wrap', 'Panel-Draped']),
            ('Waist', ['Normal', 'High', 'Mid', 'Low', 'Elastic', 'Hook', 'Zip', 'Side-Zip',
                       'Front-Opening', 'Lace-Up', 'Tie-Up', 'Corset', 'Belted', 'Drawstring']),
            ('Length', ['Short', 'Knee-Length', 'Ankle-Length', 'Floor-Length', 'Maxi']),
            ('Hem', ['Plain', 'Zari', 'Contrast', 'Broad', 'Narrow', 'Double', 'Triple', 'Embroidered',
                     'Scalloped', 'Wave', 'Lace', 'Ruffle', 'Fringe', 'Tassel', 'Cutwork', 'Gota',
                     'Piping']),
            ('Fabric', ['Pattu / Silk', 'Kanjeevaram Silk', 'Banarasi Silk', 'Raw Silk', 'Tussar Silk',
                        'Velvet', 'Organza', 'Georgette', 'Chiffon', 'Net', 'Tissue', 'Satin', 'Crepe',
                        'Brocade', 'Chanderi', 'Linen', 'Cotton', 'Jacquard']),
        ]),
]

# --------------------------------------------------------------------------
# GOWN
# --------------------------------------------------------------------------

_GOWN_CATEGORIES = [
    _category(
        'Basic Gown Silhouettes', short='Basic Silhouettes',
        options=[
            'A-Line Gown', 'Anarkali Gown', 'Flared Gown', 'Circular Gown', 'Umbrella Gown',
            'Straight Gown', 'Fit-and-Flare Gown', 'Mermaid Gown', 'Fish-Cut Gown', 'Trumpet Gown',
            'Bodycon Gown', 'Empire-Waist Gown', 'Princess-Cut Gown', 'Ball Gown', 'Tiered Gown',
            'Layered Gown', 'Kaftan Gown', 'Maxi Gown', 'Floor-Length Gown', 'High-Low Gown',
            'Asymmetric Gown',
        ]),
    _category(
        'Indian / Ethnic Gowns', short='Indian / Ethnic',
        options=[
            'Anarkali Gown', 'Indo-Western Gown', 'Lehenga Gown', 'Saree Gown', 'Dhoti Gown',
            'Angrakha Gown', 'Pakistani Gown', 'Mughal Gown', 'Pattu Gown', 'Silk Gown',
            'Bridal Gown', 'Designer Ethnic Gown', 'Sharara Gown', 'Kurta-Gown', 'Jacket Gown',
            'Cape Gown', 'Dupatta Gown', 'Floor-Length Anarkali', 'Kalidar Gown',
        ]),
    _category(
        'Gown Cutting / Construction', short='Cutting / Construction',
        options=[
            'Princess Cut', 'Panel Cut', 'Kali Cut', '4-Kali', '6-Kali', '8-Kali', '10-Kali',
            '12-Kali', '16-Kali', '20-Kali', '24-Kali', 'Circular Cut', 'Semi-Circular Cut',
            'Full Circular Cut', 'Bias Cut', 'Empire Cut', 'Yoke Cut', 'Corset Cut',
            'Panel-and-Dart', 'Draped Cut', 'Tier Cut', 'Layer Cut', 'Godet Cut',
        ]),
    _category(
        'Gown Flare Styles', short='Flare',
        options=[
            'Straight', 'Slight Flare', 'Medium Flare', 'Full Flare', 'Extra Flare',
            'Circular Flare', 'Umbrella Flare', 'Princess Flare', 'Kali Flare', 'Mermaid Flare',
            'Trumpet Flare', 'Tiered Flare', 'Layered Flare', 'Ruffle Flare', 'Godet Flare',
        ]),
    _category(
        'Ruffle / Layer Gowns', short='Ruffle / Layer',
        options=[
            'Ruffle Gown', 'Single-Ruffle Gown', 'Double-Ruffle Gown', 'Multi-Ruffle Gown',
            'Ruffle-Sleeve Gown', 'Ruffle-Hem Gown', 'Cascading-Ruffle Gown', 'Tiered Gown',
            'Double-Tier Gown', 'Triple-Tier Gown', 'Multi-Tier Gown', 'Flounce Gown',
            'Frill Gown', 'Layered Gown', 'Asymmetric Layered Gown',
        ]),
    _category(
        'Modern Gown Styles', short='Modern',
        options=[
            'Off-Shoulder Gown', 'One-Shoulder Gown', 'Cold-Shoulder Gown', 'Strapless Gown',
            'Tube Gown', 'Halter Gown', 'Backless Gown', 'Keyhole Gown', 'Cut-Out Gown',
            'Corset Gown', 'Bustier Gown', 'Peplum Gown', 'Cape Gown', 'Jacket Gown',
            'Blazer Gown', 'Shirt Gown', 'Wrap Gown', 'Draped Gown', 'Slit Gown',
            'Front-Slit Gown', 'Side-Slit Gown', 'High-Low Gown', 'Asymmetric Gown',
        ]),
]


# --------------------------------------------------------------------------
# SALWAR KAMEEZ -- the 'suit' template ("Suit (Kameez)")
# --------------------------------------------------------------------------
#
# Eight sections. Where a section groups its sub-headings (Classic /
# Traditional / Designer kameez; Traditional / Fitted / Modern bottoms; the
# dupatta's types and its draping) the groups are sub-categories under the
# heading, as the catalogue already does for the saree's regions. The
# dupatta keeps its own section, as asked.

_SUIT_CATEGORIES = [
    _category(
        'Kameez / Kurta Silhouettes', short='Kameez / Kurta',
        subcategories=[
            ('Classic', [
                'Straight-Cut Kameez', 'A-Line Kameez', 'Fitted Kameez', 'Flared Kameez',
                'Long Kameez', 'Short Kameez', 'Knee-Length Kameez', 'Calf-Length Kameez',
                'Floor-Length Kameez', 'Side-Slit Kameez',
            ]),
            ('Traditional', [
                'Anarkali Kameez', 'Kalidar Kameez', 'Angrakha Kameez', 'Punjabi Kameez',
                'Pathani Kameez', 'Mughal Kameez', 'Pakistani Kameez', 'Hyderabadi Kameez',
                'Lucknowi Kameez', 'Rajasthani Kameez', 'Gujarati Kameez',
            ]),
            ('Designer', [
                'Asymmetric Kameez', 'High-Low Kameez', 'Layered Kameez', 'Tiered Kameez',
                'Ruffle Kameez', 'Cape Kameez', 'Jacket Kameez', 'Peplum Kameez', 'Tunic Kameez',
                'Shirt-Style Kameez', 'Kaftan Kameez', 'Draped Kameez', 'Slit Kameez',
                'Overlay Kameez',
            ]),
        ]),
    _category(
        'Kameez Cutting Styles', short='Kameez Cutting',
        options=[
            'Princess Cut', 'Straight Cut', 'A-Line Cut', 'Kali Cut', 'Panel Cut', '4-Kali',
            '6-Kali', '8-Kali', '10-Kali', '12-Kali', '16-Kali', 'Circular Cut', 'Umbrella Cut',
            'Empire Cut', 'Yoke Cut', 'Angrakha Cut', 'Asymmetric Cut', 'Diagonal Cut',
            'Curved Panel Cut', 'Tier Cut', 'Layer Cut', 'Peplum Cut', 'Draped Cut',
        ]),
    _category(
        'Salwar / Bottom Styles', short='Salwar / Bottom',
        subcategories=[
            ('Traditional Salwars', [
                'Regular Salwar', 'Punjabi Salwar', 'Patiala Salwar', 'Semi-Patiala',
                'Afghani Salwar', 'Pathani Salwar', 'Peshawari Salwar', 'Balochi Salwar',
                'Sindhi Salwar', 'Pakistani Salwar', 'Hyderabadi Salwar',
            ]),
            ('Fitted Bottoms', [
                'Churidar', 'Straight Pant', 'Cigarette Pant', 'Slim Pant', 'Ankle Pant',
                'Pencil Pant', 'Tapered Pant',
            ]),
            ('Modern', [
                'Palazzo', 'Sharara', 'Gharara', 'Dhoti Pant', 'Harem Pant', 'Afghani Pant',
                'Tulip Pant', 'Tulip Salwar', 'Flared Pant', 'Wide-Leg Pant', 'Bootcut Pant',
                'Pleated Pant', 'Layered Pant',
            ]),
        ]),
    _category(
        'Patiala Styles', short='Patiala',
        options=[
            'Basic Patiala', 'Heavy Pleated Patiala', 'Semi-Patiala', 'Low-Crotch Patiala',
            'Dhoti-Patiala', 'Short Patiala', 'Long Patiala', 'Designer Patiala',
        ]),
    _category(
        'Churidar Styles', short='Churidar',
        options=[
            'Classic Churidar', 'Fitted Churidar', 'Ankle Churidar', 'Full-Length Churidar',
            'Gathered Churidar', 'Extra-Gathered Churidar', 'Embroidered Churidar',
            'Contrast Churidar', 'Stretch Churidar',
        ]),
    _category(
        'Sharara Styles', short='Sharara',
        options=[
            'Basic Sharara', 'Flared Sharara', 'Wide Sharara', 'Layered Sharara', 'Tiered Sharara',
            'Pleated Sharara', 'Panelled Sharara', 'Gota Sharara', 'Bridal Sharara',
            'Short Sharara', 'Long Sharara', 'Palazzo Sharara', 'Lehenga Sharara',
            'Anarkali Sharara',
        ]),
    _category(
        'Gharara Styles', short='Gharara',
        options=[
            'Classic Gharara', 'Double-Gharara', 'Triple-Gharara', 'Paneled Gharara',
            'Pleated Gharara', 'Flared Gharara', 'Ruffle Gharara', 'Bridal Gharara',
            'Short Gharara', 'Long Gharara', 'Embroidered Gharara', 'Gota Gharara',
        ]),
    _category(
        'Dupatta Styles', short='Dupatta',
        subcategories=[
            ('Dupatta Types', [
                'Single Dupatta', 'Double Dupatta', 'Triple Dupatta', 'Chiffon Dupatta',
                'Georgette Dupatta', 'Organza Dupatta', 'Net Dupatta', 'Silk Dupatta',
                'Banarasi Dupatta', 'Phulkari Dupatta', 'Bandhani Dupatta', 'Chikankari Dupatta',
                'Kalamkari Dupatta', 'Gota Patti Dupatta', 'Embroidered Dupatta',
                'Printed Dupatta', 'Tissue Dupatta',
            ]),
            ('Dupatta Draping', [
                'One-Shoulder Drape', 'Two-Shoulder Drape', 'Front Open', 'Front Pleated',
                'Side Drape', 'Back Drape', 'Head Drape', 'Belted Dupatta', 'Cross-Body Drape',
                'Cape Drape', 'Jacket Drape', 'Double Dupatta Drape',
                'One Dupatta on Head + One on Shoulder',
            ]),
        ]),
]

# --------------------------------------------------------------------------
# JACKET -- the Indian ethnic jacket
# --------------------------------------------------------------------------
#
# Thirteen dimensions of how an ethnic jacket is patterned, cut, closed,
# sleeved, collared, panelled, layered and worked. A name that recurs across
# dimensions ("Cape Jacket" as a women's pattern and as a cape construction,
# "Wrap Jacket" as a closure and as an angrakha pattern) is two positions by
# path, as everywhere in this file. The construction attributes a full spec
# would carry (type, cut, length, flare, closure, sleeve, collar, work) are
# each already one of these dimensions, so a detailed specification can be
# added later by combining positions rather than by a new structure.

_JACKET_CATEGORIES = [
    _category(
        'Core Ethnic Jacket Patterns', short='Core Ethnic',
        options=[
            'Nehru Jacket', 'Bandhgala Jacket', 'Achkan Jacket', 'Sherwani Jacket',
            'Indo-Western Jacket', 'Angrakha Jacket', 'Mughal Jacket', 'Rajasthani Jacket',
            'Gujarati Jacket', 'Hyderabadi Jacket', 'Punjabi Jacket', 'Pathani Jacket',
            'Kashmiri Jacket', 'Lucknowi Jacket', 'Bengali Jacket', 'South Indian Ethnic Jacket',
            'Pattu Jacket', 'Silk Ethnic Jacket',
        ]),
    _category(
        "Women's Ethnic Jacket Patterns", short="Women's Ethnic",
        options=[
            'Long Ethnic Jacket', 'Short Ethnic Jacket', 'Cropped Ethnic Jacket',
            'Waist-Length Jacket', 'Hip-Length Jacket', 'Knee-Length Jacket',
            'Calf-Length Jacket', 'Floor-Length Jacket', 'Maxi Jacket', 'Anarkali Jacket',
            'Lehenga Jacket', 'Saree Jacket', 'Kurta Jacket', 'Salwar Jacket', 'Sharara Jacket',
            'Gharara Jacket', 'Dhoti Jacket', 'Palazzo Jacket', 'Peplum Jacket', 'Cape Jacket',
            'Overlay Jacket',
        ]),
    _category(
        'Construction / Cutting Patterns', short='Construction / Cutting',
        options=[
            'Straight-Cut Jacket', 'A-Line Jacket', 'Princess-Cut Jacket', 'Panel-Cut Jacket',
            'Kali-Cut Jacket', '4-Kali Jacket', '6-Kali Jacket', '8-Kali Jacket', '12-Kali Jacket',
            'Circular Jacket', 'Semi-Circular Jacket', 'Flared Jacket', 'Umbrella Jacket',
            'Fitted Jacket', 'Tailored Jacket', 'Draped Jacket', 'Asymmetric Jacket',
            'Diagonal-Cut Jacket', 'Curved-Panel Jacket', 'Layered Jacket', 'Tiered Jacket',
            'Godet Jacket', 'Peplum-Cut Jacket', 'Empire-Cut Jacket', 'Corset-Cut Jacket',
        ]),
    _category(
        'Front Opening / Closure Patterns', short='Front / Closure',
        options=[
            'Open-Front Jacket', 'Closed-Front Jacket', 'Single-Breasted Jacket',
            'Double-Breasted Jacket', 'Centre-Button Jacket', 'Side-Button Jacket',
            'Concealed-Button Jacket', 'Hook-and-Eye Jacket', 'Zip Jacket', 'Tie-Up Jacket',
            'Lace-Up Jacket', 'Angrakha-Closure Jacket', 'Wrap Jacket', 'Overlap Jacket',
            'Asymmetric Closure Jacket',
        ]),
    _category(
        'Angrakha / Wrap Patterns', short='Angrakha / Wrap',
        options=[
            'Angrakha Jacket', 'Double-Angrakha Jacket', 'Side-Tie Jacket', 'Front-Tie Jacket',
            'Wrap Jacket', 'Cross-Over Jacket', 'Overlap Jacket', 'Layered Wrap Jacket',
            'Asymmetric Wrap Jacket', 'Tie-Waist Jacket', 'Belted Wrap Jacket',
        ]),
    _category(
        'Cape & Overlay Jackets', short='Cape & Overlay',
        options=[
            'Cape Jacket', 'Cape-Sleeve Jacket', 'Short Cape Jacket', 'Long Cape Jacket',
            'Attached Cape Jacket', 'Detachable Cape Jacket', 'Sheer Cape Jacket',
            'Net Cape Jacket', 'Organza Cape Jacket', 'Draped Cape Jacket', 'Poncho Jacket',
            'Shrug Jacket', 'Long Shrug', 'Ethnic Shrug', 'Open-Front Shrug', 'Kimono Jacket',
            'Kaftan Jacket',
        ]),
    _category(
        'Lehenga / Bridal Jacket Patterns', short='Lehenga / Bridal',
        options=[
            'Lehenga Jacket', 'Bridal Lehenga Jacket', 'Short Lehenga Jacket',
            'Long Lehenga Jacket', 'Cropped Lehenga Jacket', 'Peplum Lehenga Jacket',
            'Corset Lehenga Jacket', 'Anarkali Lehenga Jacket', 'Cape Lehenga Jacket',
            'Jacket with Dupatta', 'Jacket with Skirt', 'Jacket with Sharara',
            'Jacket with Gharara', 'Jacket with Palazzo', 'Jacket with Dhoti',
        ]),
    _category(
        'Modern Indo-Western Jacket Patterns', short='Modern Indo-Western',
        options=[
            'Blazer Jacket', 'Ethnic Blazer', 'Bandhgala Blazer', 'Longline Blazer',
            'Cropped Blazer', 'Double-Breasted Blazer', 'Tuxedo-Style Ethnic Jacket',
            'Shirt Jacket', 'Denim Ethnic Jacket', 'Bomber Ethnic Jacket',
            'Biker-Style Ethnic Jacket', 'Trench-Style Ethnic Jacket', 'Utility Jacket',
            'Waistcoat Jacket', 'Corset Jacket', 'Bustier Jacket', 'Structured Jacket',
            'Sculpted Jacket',
        ]),
    _category(
        'Sleeve Patterns', short='Sleeve',
        options=[
            'Sleeveless Jacket', 'Cap-Sleeve Jacket', 'Short-Sleeve Jacket', 'Elbow-Sleeve Jacket',
            '3/4-Sleeve Jacket', 'Full-Sleeve Jacket', 'Puff-Sleeve Jacket', 'Bell-Sleeve Jacket',
            'Flared-Sleeve Jacket', 'Bishop-Sleeve Jacket', 'Balloon-Sleeve Jacket',
            'Ruffle-Sleeve Jacket', 'Cape-Sleeve Jacket', 'One-Sleeve Jacket',
            'Off-Shoulder Jacket', 'Cold-Shoulder Jacket', 'Dolman-Sleeve Jacket',
            'Kimono-Sleeve Jacket',
        ]),
    _category(
        'Collar / Neck Patterns', short='Collar / Neck',
        options=[
            'Nehru Collar', 'Mandarin Collar', 'Band Collar', 'Chinese Collar', 'Shirt Collar',
            'Stand Collar', 'High Collar', 'Shawl Collar', 'Notch Collar', 'Lapel Collar',
            'Peak Lapel', 'Round Neck', 'V-Neck', 'Deep V-Neck', 'U-Neck', 'Boat Neck',
            'Square Neck', 'Keyhole Neck', 'Angrakha Neck', 'Collarless Jacket',
        ]),
    _category(
        'Panel / Decorative Construction', short='Panel / Decorative',
        options=[
            'Contrast Panel Jacket', 'Centre-Panel Jacket', 'Side-Panel Jacket',
            'Princess-Panel Jacket', 'Vertical-Panel Jacket', 'Horizontal-Panel Jacket',
            'Diagonal-Panel Jacket', 'Multi-Panel Jacket', 'Patchwork Jacket', 'Appliqué Jacket',
            'Cutwork Jacket', 'Embroidered Panel Jacket', 'Border-Panel Jacket',
            'Mirror-Panel Jacket',
        ]),
    _category(
        'Layered Jackets', short='Layered',
        options=[
            'Double-Layer Jacket', 'Triple-Layer Jacket', 'Multi-Layer Jacket', 'Tiered Jacket',
            'Ruffle-Layer Jacket', 'Flounce Jacket', 'Cascading Jacket', 'Peplum-Layer Jacket',
            'Asymmetric Layer Jacket', 'Detachable-Layer Jacket', 'Jacket-on-Jacket',
        ]),
    _category(
        'Traditional Work-Based Jacket Names', short='Work-Based',
        options=[
            'Zardozi Jacket', 'Maggam Jacket', 'Aari Jacket', 'Gota Patti Jacket',
            'Mirror-Work Jacket', 'Chikankari Jacket', 'Phulkari Jacket', 'Kantha Jacket',
            'Kutch-Work Jacket', 'Kalamkari Jacket', 'Bandhani Jacket', 'Ajrakh Jacket',
            'Ikat Jacket', 'Block-Print Jacket', 'Brocade Jacket', 'Zari Jacket', 'Sequin Jacket',
            'Cutdana Jacket', 'Pearl-Work Jacket', 'Appliqué Jacket',
        ]),
]

# --------------------------------------------------------------------------
# MEN'S WEAR
#
# Same dimensions as the women's catalogues above: what it is, how it is cut,
# what it is made of, the occasion, and the parts a photograph can be of --
# kept apart so "Slim Fit" in Fit and "Slim Fit Shirt" in Type are two
# positions, not one. Keys are GarmentTemplate.key values.
# --------------------------------------------------------------------------

_MENS_SHIRT_CATEGORIES = [
    _category(
        'Shirt Types', short='Types',
        options=[
            'Formal Shirt', 'Casual Shirt', 'Dress Shirt', 'Oxford Shirt', 'Linen Shirt',
            'Denim Shirt', 'Printed Shirt', 'Checked Shirt', 'Striped Shirt',
            'Mandarin Collar Shirt', 'Cuban Collar Shirt', 'Band Collar Shirt',
            'Half Sleeve Shirt', 'Full Sleeve Shirt', 'Short Kurta Shirt', 'Oversized Shirt',
            'Slim Fit Shirt', 'Regular Fit Shirt',
        ]),
    _category(
        'Collar Patterns', short='Collar',
        options=[
            'Spread Collar', 'Point Collar', 'Button-Down Collar', 'Mandarin Collar',
            'Cuban Collar', 'Band Collar', 'Club Collar', 'Cutaway Collar', 'Wing Collar',
            'Pin Collar', 'Tab Collar', 'Camp Collar',
        ]),
    _category(
        'Sleeve & Cuff Patterns', short='Sleeve / Cuff',
        subcategories=[
            ('Sleeve', ['Half Sleeve', 'Full Sleeve', 'Roll-Up Sleeve', 'Raglan Sleeve',
                        'Bishop Sleeve', 'Puff Sleeve']),
            ('Cuff', ['Single-Button Cuff', 'Double-Button Cuff', 'French Cuff', 'Rounded Cuff',
                      'Square Cuff', 'Angled Cuff', 'Convertible Cuff']),
        ]),
    _category(
        'Front / Placket & Pocket Patterns', short='Front / Pocket',
        subcategories=[
            ('Placket', ['Plain Placket', 'French Placket', 'Hidden Placket', 'Contrast Placket',
                         'Half Placket', 'Popover']),
            ('Pocket', ['No Pocket', 'Single Chest Pocket', 'Double Chest Pocket', 'Flap Pocket',
                        'Welt Pocket', 'Patch Pocket']),
        ]),
    _category(
        'Back & Yoke Patterns', short='Back / Yoke',
        options=[
            'Plain Back', 'Box Pleat Back', 'Side Pleat Back', 'Darted Back', 'Split Yoke',
            'Single Yoke', 'Western Yoke', 'Locker Loop Back',
        ]),
    _category(
        'Fabric / Print', short='Fabric / Print',
        options=[
            'Cotton', 'Linen', 'Poplin', 'Oxford Cloth', 'Twill', 'Chambray', 'Denim', 'Flannel',
            'Satin', 'Silk', 'Checks', 'Stripes', 'Floral Print', 'Geometric Print',
            'Block Print', 'Solid',
        ]),
]

_T_SHIRT_CATEGORIES = [
    _category(
        'T-Shirt Types', short='Types',
        options=[
            'Crew Neck T-Shirt', 'V-Neck T-Shirt', 'Polo T-Shirt', 'Henley T-Shirt',
            'Round Neck T-Shirt', 'Oversized T-Shirt', 'Graphic T-Shirt', 'Printed T-Shirt',
            'Full Sleeve T-Shirt', 'Half Sleeve T-Shirt', 'Tank Top', 'Sports T-Shirt',
        ]),
    _category(
        'Neck Patterns', short='Neck',
        options=[
            'Crew Neck', 'V-Neck', 'Deep V-Neck', 'Scoop Neck', 'Henley Neck', 'Polo Collar',
            'Mock Neck', 'Turtle Neck', 'Boat Neck',
        ]),
    _category(
        'Sleeve Patterns', short='Sleeve',
        options=[
            'Sleeveless', 'Cap Sleeve', 'Half Sleeve', 'Three-Quarter Sleeve', 'Full Sleeve',
            'Raglan Sleeve', 'Drop Shoulder', 'Ringer Sleeve',
        ]),
    _category(
        'Print / Graphic', short='Print',
        options=[
            'Solid', 'Graphic Print', 'Typography Print', 'All-Over Print', 'Chest Print',
            'Back Print', 'Tie-Dye', 'Stripes', 'Colour Block', 'Embroidered Logo',
        ]),
]

_KURTA_CATEGORIES = [
    _category(
        'Kurta Types', short='Types',
        options=[
            'Straight Kurta', 'Short Kurta', 'Long Kurta', 'Pathani Kurta', 'Asymmetric Kurta',
            'Angrakha Kurta', 'Lucknowi Kurta', 'Nehru Collar Kurta', 'Band Collar Kurta',
            'Silk Kurta', 'Cotton Kurta', 'Linen Kurta', 'Embroidered Kurta', 'Printed Kurta',
        ]),
    _category(
        'Cut / Silhouette', short='Cut',
        options=[
            'Straight Cut', 'A-Line Cut', 'Asymmetric Cut', 'Pathani Cut', 'Angrakha Cut',
            'Kalidar Cut', 'Slim Fit', 'Regular Fit', 'Relaxed Fit',
        ]),
    _category(
        'Collar / Neck Patterns', short='Collar / Neck',
        options=[
            'Nehru Collar', 'Band Collar', 'Mandarin Collar', 'Shirt Collar', 'Collarless',
            'Round Neck', 'V-Neck', 'Keyhole Neck', 'Angrakha Neck',
        ]),
    _category(
        'Placket & Front Patterns', short='Placket / Front',
        options=[
            'Short Placket', 'Long Placket', 'Side Placket', 'Hidden Placket', 'Angrakha Front',
            'Asymmetric Front', 'Button-Down Front', 'Contrast Placket', 'Embroidered Placket',
        ]),
    _category(
        'Sleeve & Cuff Patterns', short='Sleeve / Cuff',
        options=[
            'Half Sleeve', 'Full Sleeve', 'Roll-Up Sleeve', 'Plain Cuff', 'Buttoned Cuff',
            'Embroidered Cuff', 'Contrast Cuff',
        ]),
    _category(
        'Side Slit & Hem Patterns', short='Slit / Hem',
        options=[
            'Side Slit', 'High Side Slit', 'No Slit', 'Straight Hem', 'Curved Hem',
            'Asymmetric Hem', 'Embroidered Hem', 'Contrast Hem',
        ]),
    _category(
        'Embroidery / Work', short='Embroidery',
        options=[
            'Chikankari', 'Lucknowi Work', 'Zardozi', 'Thread Embroidery', 'Mirror Work',
            'Kantha', 'Phulkari', 'Block Print', 'Bandhani', 'Ajrakh', 'Ikat', 'Plain',
        ]),
]

_INDO_WESTERN_CATEGORIES = [
    _category(
        'Indo-Western Types', short='Types',
        options=[
            'Indo-Western Kurta', 'Indo-Western Jacket', 'Asymmetric Indo-Western',
            'Draped Indo-Western', 'Layered Indo-Western', 'Indo-Western Suit',
            'Kurta with Jacket', 'Kurta with Waistcoat', 'Kurta with Nehru Jacket',
        ]),
    _category(
        'Silhouette / Cut', short='Silhouette',
        options=[
            'Asymmetric Cut', 'Draped Cut', 'Layered Cut', 'Cowl Drape', 'Angrakha Cut',
            'Bandhgala Cut', 'Jodhpuri Cut', 'Slim Fit', 'Regular Fit',
        ]),
    _category(
        'Collar / Neck Patterns', short='Collar / Neck',
        options=[
            'Bandhgala Collar', 'Mandarin Collar', 'Nehru Collar', 'Shawl Collar',
            'Notch Lapel', 'Collarless', 'Asymmetric Neck',
        ]),
    _category(
        'Embroidery / Work', short='Embroidery',
        options=[
            'Zardozi', 'Thread Embroidery', 'Sequin Work', 'Mirror Work', 'Bead Work',
            'Cut-Work', 'Brocade', 'Printed', 'Plain',
        ]),
    _category(
        'Occasion', short='Occasion',
        options=[
            'Wedding', 'Reception', 'Sangeet', 'Engagement', 'Festive', 'Cocktail', 'Party',
        ]),
]

_MENS_SUIT_CATEGORIES = [
    _category(
        'Suit Types', short='Types',
        options=[
            'Two-Piece Suit', 'Three-Piece Suit', 'Tuxedo', 'Dinner Suit', 'Business Suit',
            'Formal Suit', 'Wedding Suit', 'Bandhgala Suit', 'Jodhpuri Suit',
            'Double-Breasted Suit', 'Single-Breasted Suit', 'Slim Fit Suit', 'Regular Fit Suit',
        ]),
    _category(
        'Lapel / Collar Patterns', short='Lapel',
        options=[
            'Notch Lapel', 'Peak Lapel', 'Shawl Lapel', 'Bandhgala Collar', 'Wide Lapel',
            'Slim Lapel', 'Contrast Lapel', 'Satin Lapel',
        ]),
    _category(
        'Jacket Front / Button Patterns', short='Front / Buttons',
        options=[
            'One-Button', 'Two-Button', 'Three-Button', 'Double-Breasted Four-Button',
            'Double-Breasted Six-Button', 'Covered Buttons', 'Contrast Buttons',
        ]),
    _category(
        'Pocket & Vent Patterns', short='Pocket / Vent',
        subcategories=[
            ('Pocket', ['Flap Pocket', 'Jetted Pocket', 'Patch Pocket', 'Ticket Pocket',
                        'Slanted Pocket', 'Welt Breast Pocket']),
            ('Vent', ['Centre Vent', 'Side Vents', 'No Vent']),
        ]),
    _category(
        'Trouser Patterns', short='Trouser',
        options=[
            'Flat Front', 'Single Pleat', 'Double Pleat', 'Plain Hem', 'Cuffed Hem',
            'Side Adjusters', 'Belt Loops', 'Tapered Leg', 'Straight Leg',
        ]),
    _category(
        'Waistcoat Patterns', short='Waistcoat',
        options=[
            'Single-Breasted Waistcoat', 'Double-Breasted Waistcoat', 'Shawl Collar Waistcoat',
            'Lapel-Less Waistcoat', 'Low-Cut Waistcoat', 'Contrast Waistcoat',
        ]),
    _category(
        'Fabric / Pattern', short='Fabric',
        options=[
            'Wool', 'Worsted Wool', 'Tweed', 'Linen', 'Cotton', 'Velvet', 'Silk Blend',
            'Pinstripe', 'Chalk Stripe', 'Glen Check', 'Herringbone', 'Houndstooth', 'Solid',
        ]),
]

_TROUSER_CATEGORIES = [
    _category(
        'Trouser Types', short='Types',
        options=[
            'Formal Trouser', 'Dress Trouser', 'Chinos', 'Casual Trouser', 'Straight Fit Trouser',
            'Slim Fit Trouser', 'Regular Fit Trouser', 'Tapered Trouser', 'Pleated Trouser',
            'Flat Front Trouser', 'Wide Leg Trouser', 'Linen Trouser', 'Cotton Trouser',
            'Cargo Pant', 'Utility Pant',
        ]),
    _category(
        'Front & Waist Patterns', short='Front / Waist',
        options=[
            'Flat Front', 'Single Pleat', 'Double Pleat', 'Belt Loops', 'Side Adjusters',
            'Elastic Waist', 'Drawstring Waist', 'Extended Tab Waist',
        ]),
    _category(
        'Pocket Patterns', short='Pocket',
        options=[
            'Side Pocket', 'Slanted Pocket', 'Back Welt Pocket', 'Back Flap Pocket',
            'Cargo Pocket', 'Patch Pocket', 'Coin Pocket',
        ]),
    _category(
        'Leg & Hem Patterns', short='Leg / Hem',
        options=[
            'Straight Leg', 'Slim Leg', 'Tapered Leg', 'Wide Leg', 'Bootcut', 'Plain Hem',
            'Cuffed Hem', 'Ankle Length', 'Full Length',
        ]),
]

_JEANS_CATEGORIES = [
    _category(
        'Jeans Types', short='Types',
        options=[
            'Straight Fit Jeans', 'Slim Fit Jeans', 'Skinny Jeans', 'Regular Fit Jeans',
            'Relaxed Fit Jeans', 'Tapered Jeans', 'Bootcut Jeans', 'Wide Leg Jeans',
            'Distressed Jeans', 'Ripped Jeans', 'Denim Joggers',
        ]),
    _category(
        'Rise & Closure', short='Rise / Closure',
        options=['Low Rise', 'Mid Rise', 'High Rise', 'Zip Fly', 'Button Fly']),
    _category(
        'Wash / Finish', short='Wash',
        options=[
            'Raw Denim', 'Light Wash', 'Medium Wash', 'Dark Wash', 'Black Denim', 'Acid Wash',
            'Stone Wash', 'Distressed', 'Ripped', 'Whiskered', 'Faded',
        ]),
    _category(
        'Pocket & Hem Patterns', short='Pocket / Hem',
        options=[
            'Five-Pocket', 'Patch Back Pocket', 'Embroidered Back Pocket', 'Plain Hem',
            'Cuffed Hem', 'Raw Edge Hem', 'Frayed Hem',
        ]),
]

_SHORTS_CATEGORIES = [
    _category(
        'Shorts Types', short='Types',
        options=[
            'Casual Shorts', 'Formal Shorts', 'Bermuda Shorts', 'Denim Shorts', 'Cargo Shorts',
            'Chino Shorts', 'Sports Shorts', 'Linen Shorts',
        ]),
    _category(
        'Waist & Pocket Patterns', short='Waist / Pocket',
        options=[
            'Belt Loops', 'Elastic Waist', 'Drawstring Waist', 'Side Pocket', 'Back Pocket',
            'Cargo Pocket', 'Zip Pocket',
        ]),
    _category(
        'Length & Hem', short='Length / Hem',
        options=[
            'Above Knee', 'Knee Length', 'Below Knee', 'Plain Hem', 'Cuffed Hem', 'Raw Hem',
        ]),
]

_MENS_BOTTOM_WEAR_CATEGORIES = [
    _category(
        'Bottom Types', short='Types',
        options=[
            'Churidar', 'Pajama', 'Kurta Pajama', 'Pathani Pajama', 'Salwar', 'Dhoti',
            'Dhoti Pants', 'Afghani Pants', 'Patiala Pajama', 'Mojari Pants', 'Pleated Dhoti Pants',
        ]),
    _category(
        'Waist & Drawstring Patterns', short='Waist',
        options=[
            'Drawstring Waist', 'Elastic Waist', 'Elastic with Drawstring', 'Belted Waist',
            'Button Waist', 'Pleated Waist',
        ]),
    _category(
        'Leg & Bottom Patterns', short='Leg / Bottom',
        options=[
            'Straight Leg', 'Tapered Leg', 'Gathered Ankle', 'Churidar Gathers', 'Cuffed Ankle',
            'Draped Leg', 'Pleated Front', 'Side Pocket', 'No Pocket',
        ]),
    _category(
        'Border / Work', short='Border / Work',
        options=[
            'Plain', 'Zari Border', 'Embroidered Border', 'Printed', 'Contrast Piping',
        ]),
]

_COAT_CATEGORIES = [
    _category(
        'Coat Types', short='Types',
        options=[
            'Formal Coat', 'Suit Coat', 'Long Coat', 'Overcoat', 'Trench Coat', 'Peacoat',
            'Chesterfield Coat', 'Double-Breasted Coat', 'Winter Coat', 'Designer Coat',
        ]),
    _category(
        'Lapel / Collar Patterns', short='Lapel',
        options=[
            'Notch Lapel', 'Peak Lapel', 'Shawl Collar', 'Stand Collar', 'Storm Collar',
            'Ulster Collar', 'Fur Collar', 'Velvet Collar',
        ]),
    _category(
        'Front / Closure Patterns', short='Front / Closure',
        options=[
            'Single-Breasted', 'Double-Breasted', 'Concealed Buttons', 'Zip Front', 'Belted',
            'Toggle Closure',
        ]),
    _category(
        'Pocket & Vent Patterns', short='Pocket / Vent',
        options=[
            'Flap Pocket', 'Welt Pocket', 'Patch Pocket', 'Slanted Pocket', 'Centre Vent',
            'Side Vents', 'No Vent',
        ]),
    _category(
        'Fabric', short='Fabric',
        options=[
            'Wool', 'Cashmere', 'Tweed', 'Camel Hair', 'Gabardine', 'Cotton Twill', 'Velvet',
            'Herringbone', 'Houndstooth', 'Solid',
        ]),
]

_CASUAL_WEAR_CATEGORIES = [
    _category(
        'Casual Wear Types', short='Types',
        options=[
            'Hoodie', 'Sweatshirt', 'Pullover', 'Cardigan', 'Sweater', 'Tracksuit', 'Joggers',
            'Lounge Pants', 'Track Pants', 'Co-Ord Set', 'Casual Co-Ord Set',
        ]),
    _category(
        'Neck / Hood Patterns', short='Neck / Hood',
        options=[
            'Pullover Hood', 'Zip Hood', 'Crew Neck', 'V-Neck', 'Half Zip', 'Turtle Neck',
            'Shawl Collar', 'Polo Collar',
        ]),
    _category(
        'Pocket & Closure Patterns', short='Pocket / Closure',
        options=[
            'Kangaroo Pocket', 'Side Pocket', 'Zip Pocket', 'No Pocket', 'Full Zip', 'Half Zip',
            'Button Front', 'Pullover',
        ]),
    _category(
        'Cuff / Hem & Leg Patterns', short='Cuff / Hem',
        options=[
            'Rib Cuff', 'Elastic Cuff', 'Open Hem', 'Drawstring Hem', 'Tapered Leg',
            'Straight Leg', 'Cuffed Ankle', 'Open Ankle',
        ]),
    _category(
        'Print / Graphic', short='Print',
        options=[
            'Solid', 'Graphic Print', 'Typography', 'Colour Block', 'Stripes', 'Tie-Dye',
            'Embroidered Logo', 'All-Over Print',
        ]),
]

_SHERWANI_CATEGORIES = [
    _category(
        'Sherwani Types', short='Types',
        options=[
            'Classic Sherwani', 'Indo-Western Sherwani', 'Achkan', 'Jodhpuri Sherwani',
            'Angrakha Sherwani', 'Asymmetric Sherwani', 'Embroidered Sherwani',
            'Bandhgala Sherwani', 'Designer Sherwani', 'Wedding Sherwani', 'Reception Sherwani',
        ]),
    _category(
        'Collar / Neck Patterns', short='Collar / Neck',
        options=[
            'Bandhgala Collar', 'Mandarin Collar', 'Nehru Collar', 'Shawl Collar',
            'Notch Lapel', 'Angrakha Neck', 'Embroidered Collar',
        ]),
    _category(
        'Front / Closure Patterns', short='Front / Closure',
        options=[
            'Button Front', 'Hook Front', 'Concealed Zip', 'Open Front', 'Angrakha Closure',
            'Asymmetric Closure', 'Double-Breasted',
        ]),
    _category(
        'Sleeve, Hem & Vent Patterns', short='Sleeve / Hem',
        options=[
            'Full Sleeve', 'Plain Cuff', 'Embroidered Cuff', 'Straight Hem', 'Curved Hem',
            'Asymmetric Hem', 'Centre Vent', 'Side Vents', 'No Vent',
        ]),
    _category(
        'Embroidery / Work', short='Embroidery',
        options=[
            'Zardozi', 'Thread Embroidery', 'Sequin Work', 'Mirror Work', 'Bead Work',
            'Dabka Work', 'Resham Work', 'Brocade', 'Jacquard', 'Printed', 'Plain',
        ]),
    _category(
        'Set / Pairing', short='Set',
        options=[
            'Sherwani Pajama Set', 'Sherwani Churidar Set', 'Achkan Pajama Set', 'Jodhpuri Set',
            'Sherwani with Stole', 'Sherwani with Safa', 'Sherwani with Mojari',
        ]),
    _category(
        'Occasion', short='Occasion',
        options=['Wedding', 'Reception', 'Sangeet', 'Engagement', 'Festive', 'Groomsmen']),
]


CATALOGUE = {
    'saree': {'key': 'saree', 'label': 'Saree', 'categories': _SAREE_CATEGORIES},
    'blouse': {'key': 'blouse', 'label': 'Blouse', 'categories': _BLOUSE_CATEGORIES},
    'lehenga': {'key': 'lehenga', 'label': 'Lehenga', 'categories': _LEHENGA_CATEGORIES},
    'gown': {'key': 'gown', 'label': 'Gown', 'categories': _GOWN_CATEGORIES},
    # The garment template is 'suit' ("Suit (Kameez)"); the boutique calls it
    # a salwar kameez, and so does its catalogue.
    'suit': {'key': 'suit', 'label': 'Salwar Kameez', 'categories': _SUIT_CATEGORIES},
    'jacket': {'key': 'jacket', 'label': 'Jacket', 'categories': _JACKET_CATEGORIES},
    # --- men's wear (sherwani's template predates its catalogue; the rest are new)
    'sherwani': {'key': 'sherwani', 'label': 'Sherwani', 'categories': _SHERWANI_CATEGORIES},
    'shirt': {'key': 'shirt', 'label': "Men's Shirt", 'categories': _MENS_SHIRT_CATEGORIES},
    't_shirt': {'key': 't_shirt', 'label': 'T-Shirt', 'categories': _T_SHIRT_CATEGORIES},
    'kurta': {'key': 'kurta', 'label': "Men's Kurta", 'categories': _KURTA_CATEGORIES},
    'indo_western': {'key': 'indo_western', 'label': 'Indo-Western', 'categories': _INDO_WESTERN_CATEGORIES},
    'mens_suit': {'key': 'mens_suit', 'label': "Men's Suit", 'categories': _MENS_SUIT_CATEGORIES},
    'trouser': {'key': 'trouser', 'label': 'Trouser', 'categories': _TROUSER_CATEGORIES},
    'jeans': {'key': 'jeans', 'label': 'Jeans', 'categories': _JEANS_CATEGORIES},
    'shorts': {'key': 'shorts', 'label': 'Shorts', 'categories': _SHORTS_CATEGORIES},
    'mens_bottom_wear': {'key': 'mens_bottom_wear', 'label': "Men's Bottom Wear", 'categories': _MENS_BOTTOM_WEAR_CATEGORIES},
    'coat': {'key': 'coat', 'label': 'Coat / Overcoat', 'categories': _COAT_CATEGORIES},
    'casual_wear': {'key': 'casual_wear', 'label': 'Casual Wear', 'categories': _CASUAL_WEAR_CATEGORIES},
}


# --------------------------------------------------------------------------
# reading and checking
# --------------------------------------------------------------------------

class CatalogueError(ValueError):
    pass


def tree(garment_key=None):
    """The catalogue for one garment, or every garment that has one."""
    if garment_key is None:
        return list(CATALOGUE.values())
    return CATALOGUE.get(garment_key)


def resolve_path(garment_key, category, subcategory='', option=''):
    """Check a path exists and return it with its labels filled in.

    An option is required wherever the category (or sub-category) declares
    any; where none are declared yet -- the blouse dimensions, until their
    catalogue arrives -- a design may be filed at that level.
    """
    garment = CATALOGUE.get(garment_key or '')
    if garment is None:
        raise CatalogueError(f'No design catalogue is defined for garment {garment_key!r}.')
    cat = next((c for c in garment['categories'] if c['key'] == category), None)
    if cat is None:
        raise CatalogueError(f'{garment["label"]} has no catalogue category {category!r}.')

    path = {'garment': garment_key, 'category': cat['key'], 'category_label': cat['label'],
            'subcategory': '', 'subcategory_label': '', 'option': '', 'option_label': ''}

    if 'subcategories' in cat:
        sub = next((s for s in cat['subcategories'] if s['key'] == subcategory), None)
        if sub is None:
            raise CatalogueError(f'{cat["label"]} needs one of its sub-categories.')
        path.update(subcategory=sub['key'], subcategory_label=sub['label'])
        options = sub['options']
    else:
        if subcategory:
            raise CatalogueError(f'{cat["label"]} has no sub-categories.')
        options = cat['options']

    if options:
        opt = next((o for o in options if o['key'] == option), None)
        if opt is None:
            raise CatalogueError('Choose a design option from the list.')
        path.update(option=opt['key'], option_label=opt['label'])
    elif option:
        raise CatalogueError('This section has no design options yet.')

    path['path'] = ' › '.join(p for p in (
        path['category_label'], path['subcategory_label'], path['option_label']) if p)
    return path
