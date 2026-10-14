# Design Studio — garment on the customer: demo payload

For the developer of the Design Studio generate API
(`POST /api/v1/designstudio/generate`). This adds **two inputs** to today's request so the
garment can be drawn **on the actual customer**:

1. `modelImage`: the customer's own full-length photo. The field already exists; it is now the
   customer, not a stock model.
2. `measurements`: **new**. The customer's body measurements for this garment, so the fit,
   length and proportions in the picture match the customer.

Everything else (`garment`, `designs`, `fabrics`, `views`, `notes` …) is unchanged from
`DESIGN_STUDIO_API.md`.

We send this from our order's **Review** step, only after the customer has given consent for
their photo and measurements to be used to make AI pictures.

---

## Demo request

```json
{
  "clientId": "shop_lakshmi:42",
  "garment": "BLOUSE",
  "productName": "Blouse",
  "designs": [
    { "area": "FRONT",  "image": "https://res.cloudinary.com/scaleezy/image/upload/v1/designs/front-neck.jpg" },
    { "area": "BACK",   "image": "https://res.cloudinary.com/scaleezy/image/upload/v1/designs/keyhole-back.jpg" },
    { "area": "SLEEVE", "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ..." }
  ],
  "fabrics": [
    {
      "image": "https://res.cloudinary.com/scaleezy/image/upload/v1/fabrics/fab-0003.jpg",
      "name": "Banarasi Brocade",
      "material": "Silk blend with zari work",
      "color": "Wine / deep magenta",
      "colorHex": "#722F37",
      "itemCode": "FAB-0003"
    }
  ],
  "notes": "festive look",

  "modelImageUrl": "https://res.cloudinary.com/scaleezy/image/upload/v1/customers/c-1093-full-length.jpg",

  "measurements": [
    { "key": "blouse_length", "label": "Blouse Length", "value": 15,    "unit": "in" },
    { "key": "shoulder",      "label": "Shoulder",      "value": 14.5,  "unit": "in" },
    { "key": "upper_chest",   "label": "Upper Chest",   "value": 34,    "unit": "in" },
    { "key": "chest",         "label": "Chest",         "value": 36,    "unit": "in" },
    { "key": "waist",         "label": "Waist",         "value": 30,    "unit": "in" },
    { "key": "armhole",       "label": "Armhole",       "value": 16,    "unit": "in" }
  ]
}
```

A saree order sends the same shape, with that garment's own measurements, for example:

```json
"measurements": [
  { "key": "height",         "label": "Height",          "value": 62,   "unit": "in" },
  { "key": "bust",           "label": "Bust",            "value": 36,   "unit": "in" },
  { "key": "waist",          "label": "Waist",           "value": 30,   "unit": "in" },
  { "key": "hip",            "label": "Hip",             "value": 40,   "unit": "in" },
  { "key": "waist_to_floor", "label": "Waist-to-Floor",  "value": 40.5, "unit": "in" },
  { "key": "blouse_length",  "label": "Blouse Length",   "value": 14,   "unit": "in" },
  { "key": "pallu_length",   "label": "Pallu Length",    "value": 32,   "unit": "in" }
]
```

---

## The new and changed fields

| Field | Type | Required | Meaning |
| :--- | :--- | :--- | :--- |
| `modelImageUrl` (= `modelImage`) | string | No | The **customer's** full-length photo: an https Cloudinary link or base64, as today. One person, standing, facing the camera, whole body in frame, plain fitted clothes. Keep their face, body shape, skin tone and hair; change only the clothes. |
| `measurements` | array, 0–40 | No | The customer's measurements for this garment. Sent only together with `modelImageUrl`. |
| `measurements[].key` | string, ≤40, `a-z 0-9 _` | Yes | A stable id, e.g. `bust`, `waist`, `blouse_length`. The list of keys we use is below. |
| `measurements[].label` | string, ≤60 | Yes | The human name, e.g. `"Blouse Length"`. Use it if a key is new to you. |
| `measurements[].value` | number, > 0 | Yes | e.g. `36.5`. Up to 2 decimals. |
| `measurements[].unit` | `in`, `cm` or `m` | Yes | Almost always `in`. |

Only filled-in measurements are sent, so the array can be short or empty. Some entries
describe the garment rather than the body (`pallu_length`, `border_width`, `pleat_width` …);
use them for proportions where they help, and ignore any you cannot use. **Please do not
refuse an unknown key.**

### Keys we send today

Body: `height`, `shoulder`, `front_shoulder`, `back_shoulder`, `bust`, `chest`, `upper_chest`,
`underbust`, `across_chest`, `across_back`, `waist`, `high_waist`, `hip`, `armhole`,
`waist_to_floor`, `shoulder_to_floor`.

Garment lengths and sizes: `blouse_length`, `petticoat_length`, `petticoat_waist`,
`petticoat_flare`, `saree_width`, `pallu_length`, `pallu_width`, `pleat_length`, `pleat_width`,
`border_width`, `top_border_width`, `bottom_border_width`, `pallu_border_width`,
`pattern_repeat`, `motif_size`, `motif_spacing`, `plain_body_width`, `plain_pallu_width`.

New garment templates can add keys; `label` always says what each one is.

---

## What we expect back

Exactly today's event stream: `start`, one `image` per view (`front`, then `back`), `done`,
or `error`. Nothing new is needed in the answer.

Helpful, but optional: an `error` code for a model photo that cannot be used as a person
(for example `MODEL_IMAGE_UNUSABLE`: no person, more than one person, or not full length),
so we can ask the shop for a better photo.

## Questions for you

1. Is a flat array of `{key, label, value, unit}` easy for you, or would you prefer an object
   (`{"bust": 36, "waist": 30}`) with a single `unit`?
2. Do you want the customer's `height` to be required when `measurements` is sent? It anchors
   the scale of everything else.
3. Anything else from the customer that would help, such as gender or age range?

## On our side

The `measurements` field is switched off (`DESIGN_STUDIO_SEND_MEASUREMENTS`) until your new
version is live, because the current API refuses unknown fields. The customer photo is
already sent in `modelImageUrl`.
