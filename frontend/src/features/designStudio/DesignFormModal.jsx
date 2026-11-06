import { FileText, IndianRupee, Link as LinkIcon, Save, Shirt, Sparkles, Tag, Type, Upload } from 'lucide-react';
import { CameraButton, Field, FormModal, InfoNote } from '../../components/ui/Atelier';
import { LIMITS, cleanAmount, imageFilesError } from '../../utils/validate';
import DesignCataloguePicker from './DesignCataloguePicker';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * Add or edit one boutique design: its name, garment, neckline and sleeve,
 * price, description and photo.
 */
export default function DesignFormModal({ designForm, designImageFile, designSaving, editingDesign, handleSaveDesign, setDesignForm, setDesignImageFile, setShowDesignModal }) {
  const { t } = useLanguage();
  return (
    <FormModal
      icon={Shirt} tone="amber" zIndex={1100} width="720px"
      title={editingDesign ? t('designsPage.editDesignDetails', 'Edit Design Details') : t('designsPage.addNewDesignTitle', 'Add New Design to Collection')}
      subtitle="Add garment details to your boutique collection."
      onClose={() => setShowDesignModal(false)}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={() => setShowDesignModal(false)}>{t('common.cancel', 'Cancel')}</button>
          <button type="submit" form="design-form" className="btn-primary" disabled={designSaving}>
            <Save size={16} /> {designSaving ? t('common.saving', 'Saving…') : t('designsPage.saveDesign', 'Save Design')}
          </button>
        </>
      )}
    >
      <form id="design-form" onSubmit={handleSaveDesign} className="at-stack">
        <Field label={t('designsPage.designName', 'Design Name')} required icon={Type}>
          <input
            type="text"
            required
            className="form-control"
            placeholder="e.g. Royal Maroon Velvet Lehenga"
            maxLength={LIMITS.name}
            value={designForm.name}
            onChange={e => setDesignForm({...designForm, name: e.target.value})}
          />
        </Field>

        <div className="at-form-grid">
          <Field label={t('designsPage.garmentCategory', 'Garment Category')} required icon={Shirt}>
            <select
              className="form-control"
              value={designForm.garment_type}
              onChange={e => setDesignForm({...designForm, garment_type: e.target.value, catalogue: {}, catalogue_path: null})}
            >
              <option value="Lehenga">{t('designsPage.lehenga', 'Lehenga')}</option>
              <option value="Gown">{t('designsPage.gown', 'Gown')}</option>
              <option value="Saree">{t('designsPage.saree', 'Saree')}</option>
              <option value="Blouse">{t('designsPage.blouse', 'Blouse')}</option>
              <option value="Kurti">{t('designsPage.kurti', 'Kurti')}</option>
              <option value="Sherwani">{t('designsPage.sherwani', 'Sherwani')}</option>
              <option value="Anarkali">{t('designsPage.anarkali', 'Anarkali')}</option>
              <option value="Suit">{t('designsPage.salwarKameez', 'Salwar Kameez')}</option>
              <option value="Jacket">{t('designsPage.jacket', 'Jacket')}</option>
              {/* Men's wear. Values slug to the template / catalogue
                  keys the picker below looks up ("Mens Suit" ->
                  mens_suit), so an apostrophe would break the match. */}
              <option value="Shirt">{t('designsPage.mensShirt', "Men's Shirt")}</option>
              <option value="T-Shirt">{t('designsPage.tShirt', 'T-Shirt')}</option>
              <option value="Kurta">{t('designsPage.mensKurta', "Men's Kurta")}</option>
              <option value="Indo-Western">{t('designsPage.indoWestern', 'Indo-Western')}</option>
              <option value="Mens Suit">{t('designsPage.mensSuit', "Men's Suit")}</option>
              <option value="Trouser">{t('designsPage.trouser', 'Trouser')}</option>
              <option value="Jeans">{t('designsPage.jeans', 'Jeans')}</option>
              <option value="Shorts">{t('designsPage.shorts', 'Shorts')}</option>
              <option value="Mens Bottom Wear">{t('designsPage.mensBottomWear', "Men's Bottom Wear")}</option>
              <option value="Coat">{t('designsPage.coat', 'Coat / Overcoat')}</option>
              <option value="Casual Wear">{t('designsPage.casualWear', 'Casual Wear')}</option>
            </select>
          </Field>
          <Field label={t('designsPage.designType', 'Design Type')} required icon={Tag}>
            <select
              className="form-control"
              value={designForm.is_boutique}
              onChange={e => setDesignForm({...designForm, is_boutique: e.target.value === 'true' || e.target.value === true})}
            >
              <option value="true">{t('designsPage.boutiqueCatalogCollection', 'Boutique Catalog Collection')}</option>
              <option value="false">{t('designsPage.aiSuggestionTemplate', 'AI Suggestion Template')}</option>
            </select>
          </Field>
          {/* Where in the garment's design catalogue this design is
              filed. The garment here is a name ("Saree"); the
              catalogue is keyed the way templates are, so the name is
              slugged the same way the server will slug it. Nothing
              renders for a garment without a catalogue. */}
          <DesignCataloguePicker
            garmentKey={(designForm.garment_type || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}
            value={designForm.catalogue || {}}
            onChange={(value, payload) => setDesignForm({ ...designForm, catalogue: value, catalogue_path: payload })}
          />
          <Field label={t('designsPage.necklineStyleOptional', 'Neckline Style (Optional)')} icon={Sparkles}>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Sweetheart Neck"
              maxLength={LIMITS.name}
              value={designForm.neckline_style}
              onChange={e => setDesignForm({...designForm, neckline_style: e.target.value})}
            />
          </Field>
          <Field label={t('designsPage.sleeveStyleOptional', 'Sleeve Style (Optional)')} icon={Shirt}>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Cap Sleeve"
              maxLength={LIMITS.name}
              value={designForm.sleeve_style}
              onChange={e => setDesignForm({...designForm, sleeve_style: e.target.value})}
            />
          </Field>
        </div>

        <Field label={t('designsPage.catalogPriceLabel', 'Catalog Price (₹) - Only for Boutique Catalog')} icon={IndianRupee}>
          <input
            type="number"
            min="0"
            max={LIMITS.amount}
            step="0.01"
            inputMode="decimal"
            className="form-control"
            placeholder="e.g. 45000"
            value={designForm.price}
            onChange={e => setDesignForm({...designForm, price: cleanAmount(e.target.value)})}
            disabled={designForm.is_boutique === false || designForm.is_boutique === 'false'}
          />
        </Field>

        <Field label={t('designsPage.uploadImageOptional', 'Upload Image (Optional)')} icon={Upload}
               hint={designImageFile ? `Selected: ${designImageFile.name}` : 'Choose a photo of the garment from this device.'}>
          <input
            type="file"
            accept="image/*"
            className="form-control"
            onChange={e => {
              const f = e.target.files?.[0] || null;
              const bad = f ? imageFilesError([f]) : '';
              if (bad) { alert(bad); e.target.value = ''; return; }
              setDesignImageFile(f);
            }}
          />
          <div style={{ marginTop: '8px' }}>
            <CameraButton onFiles={([f]) => setDesignImageFile(f || null)} />
          </div>
        </Field>

        {/* 255: the width of BoutiqueDesign.image_url on the server. */}
        <Field label={t('designsPage.imageUrlOptional', 'Image URL (Optional)')} icon={LinkIcon}
               hint="Add a link if the image is hosted online.">
          <input
            type="url"
            className="form-control"
            placeholder="e.g. https://images.unsplash.com/photo-..."
            maxLength={255}
            value={designForm.image_url}
            onChange={e => setDesignForm({...designForm, image_url: e.target.value})}
          />
        </Field>

        <Field label={t('designsPage.descriptionOptional', 'Description (Optional)')} icon={FileText}>
          <textarea
            className="form-control"
            placeholder="e.g. Hand-embroidered with gold thread, georgette base..."
            rows="3"
            maxLength={LIMITS.note}
            value={designForm.description}
            onChange={e => setDesignForm({...designForm, description: e.target.value})}
          />
        </Field>
        <div className="at-field-counter" style={{ marginTop: '-8px' }}>{(designForm.description || '').length}/{LIMITS.note}</div>

        <InfoNote tone="amber" title="Tip">
          High quality images and detailed descriptions help showcase your designs better.
        </InfoNote>
      </form>
    </FormModal>
  );
}
