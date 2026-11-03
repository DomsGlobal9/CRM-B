import React, { Suspense, lazy } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, ClipboardList, Copy, Edit2, Layers, Package, Palette, PenTool, Plus, Sparkles, Trash2 } from 'lucide-react';
import DressesDropdown from '../../components/ui/DressesDropdown';
import { MAGGAM_NOTE_VOICE, SELF_DESIGNER, garmentsForGender } from '../orders/wizard';
import { validateSpec } from '../../services/templates';
import TemplateForm from '../catalog/TemplateForm';
import { VoiceRecorder } from '../../components/ui/VoiceTextarea';
import { voiceNoteList } from '../../components/ui/voiceNotes';
import { api } from '../../services/api';
import PetticoatStylePicker from '../catalog/PetticoatStylePicker';
import { FormModal, IconTile } from '../../components/ui/Atelier';
import { resolveMediaUrl } from '../../services/media';
import { ScreenLoading } from '../../components/ui/ScreenLoading';
import { LIMITS } from '../../services/validate';
import { canSeeTab } from '../../navigation/nav';
import GarmentPurchases from '../catalog/GarmentPurchases';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';

const GarmentPartPicker = lazy(() => import('../designStudio/GarmentPartPicker'));
const GarmentFabricPicker = lazy(() => import('../fabrics/GarmentFabricPicker'));
const FabricColorFilter = lazy(() => import('../fabrics/FabricColorFilter'));

/**
 * Garments: pick the garments, then for each one only what its cut needs --
 * its details, design, fabric and materials.
 */
export default function GarmentsStep({ wizard, ctaBusy, customerForm, designRequest, designerChoice, designers, fabricTaxonomy, fabrics, garmentErrors, garmentJobs, garmentTemplates, garmentTemplatesError, garmentsDone, loadGarmentTemplates, openGarment, serviceType, setDesignRequest, setGarmentJobs, setServiceType }) {
  const { activeDesignTab, addAnotherOf, addGarments, addMoreGarmentsRef, addingGarmentKey, colourFilteredFabrics, copyGarment, dropFollower, fabricColorQuery, fabricSelection, garmentLabel, handleFabricSelection, handleNext, handlePartReferences, handlePartSelection, openGarmentAt, partReferences, partSelection, removeGarment, renamingGarment, saveGarmentName, selfDesignerLabel, setActiveDesignTab, setFabricColorQuery, setRenamingGarment, updateGarmentPurchase, updateGarmentValues } = wizard;
  const { t } = useLanguage();
  const { currentUser } = useApp();
  return (
    <>
      {/* Before the first garment is picked: one centred column, like
          the Customer step. With garments, the full-width layout. */}
      <div className={`wz-type-wrap${garmentJobs.length === 0 ? ' wz-type-wrap--empty' : ''}`}>
      <div className="page-title-group">
        <h1 className="page-title">{t('wizard.typeTitle', 'What are we making?')}</h1>
        <p className="page-subtitle">{t('wizard.garmentFlowSubtitle', 'Each garment in turn: what it needs, then its design and fabric below.')}</p>
      </div>

      <div className="content-card wz-card">
        {/* Picks the first garment only. Once one is on the order the
            next is added from the prompt under the last section, so
            garments are filled in one after another, not all at once. */}
        {garmentJobs.length === 0 && <DressesDropdown
          title={t('wizard.garmentsInOrder', 'Garments in this order')}
          subtitle={t('wizard.garmentsPickSeveral', 'Tick every garment being made, then add them.')}
          garmentTemplates={garmentsForGender(garmentTemplates, customerForm.gender)}
          garmentJobs={garmentJobs}
          addingGarmentKey={addingGarmentKey}
          garmentTemplatesError={garmentTemplatesError}
          loadGarmentTemplates={loadGarmentTemplates}
          addGarments={addGarments}
        />}

        {garmentJobs.length > 1 && (() => {

          const filled = (job) => Object.keys(validateSpec(job.template, job.values, { sections: ['basic', 'style'] })).length === 0
            && (job.template?.sections || [])
              .filter((sec) => sec.key === 'basic' || sec.key === 'style')
              .some((sec) => sec.fields.some((f) => {
                const v = job.values?.[f.key];
                return f.key !== 'delivery_date' && v !== '' && v != null && !(Array.isArray(v) && !v.length)
                  && !(f.default != null && v === f.default);
              }));
          const openKey = openGarment?.key;
          return (
            <div style={{ marginTop: '16px' }}>
              {/* The same stepper the wizard draws across the top, one
                  circle per garment: a tick once every required
                  question this step asks is answered -- the same
                  check Next runs -- the open one filled, the rest
                  numbered. Clicking a circle scrolls to that garment. */}
              <div className="stepper-progress-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px 0' }}>
                {garmentJobs.map((job, idx) => {
                  const isActive = job.key === openKey;
                  const complete = garmentsDone.includes(job.key) && filled(job) && !isActive;
                  const missing = !filled(job) && Boolean(garmentErrors[job.key]);
                  // One garment shows at a time: a circle opens that one's details.
                  const goTo = () => openGarmentAt(job.key);
                  return (
                    <React.Fragment key={job.key}>
                      <div className="stepper-step stepper-step--link" role="button" tabIndex={0}
                           aria-current={isActive ? 'step' : undefined}
                           title={`Go to ${garmentLabel(job)}`}
                           onClick={goTo}
                           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(); } }}
                           style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, position: 'relative', zIndex: 2, cursor: 'pointer' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          backgroundColor: complete ? 'var(--primary-color)' : (isActive ? 'var(--selected-bg)' : 'var(--surface-inset)'),
                          color: complete ? 'var(--primary-foreground)' : isActive ? 'var(--selected-fg)' : 'var(--text-secondary)',
                          border: isActive ? '2px solid var(--primary-color)' : missing ? '2px solid var(--danger-color, #b91c1c)' : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 600, marginBottom: '8px',
                        }}>
                          {complete ? <Check size={14} /> : idx + 1}
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: isActive || complete ? 600 : 500, color: isActive || complete ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {garmentLabel(job)}
                        </span>
                        <span style={{ fontSize: '9px', color: missing ? 'var(--danger-color, #b91c1c)' : 'var(--text-secondary)', marginTop: '2px' }}>
                          {complete ? t('wizard.completed', 'Done') : missing ? t('wizard.garmentMissing', 'Something missing') : isActive ? t('wizard.garmentNow', 'Fill in now') : t('wizard.garmentNext', 'Up next')}
                        </span>
                      </div>
                      {idx < garmentJobs.length - 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', flex: 1, margin: '0 -20px', transform: 'translateY(-20px)', zIndex: 1, color: complete ? 'var(--primary-color)' : 'var(--border-color)' }}>
                          <div style={{ height: '2px', flex: 1, backgroundColor: 'currentColor' }}></div>
                          <ArrowRight size={16} style={{ marginLeft: '-4px', flexShrink: 0 }} />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {garmentJobs.map((job, idx) => {
          if (job.key !== openGarment?.key) return null;
          const sections = ['basic', 'style'].filter((k) => job.template.sections.some((sec) => sec.key === k));
          const upFront = (f) => f.key !== 'delivery_date' && (f.is_required || Boolean(f.visible_when));
          return (
            <div key={job.key} id={`wz-garment-${job.key}`} className="wz-garment">
              <div className="wz-garment-head">
                <span className="wz-garment-num">{idx + 1}</span>
                <div>
                  {renamingGarment?.key === job.key ? (
                    <input className="form-control" autoFocus maxLength={60}
                           aria-label={t('wizard.garmentName', 'Garment name')}
                           placeholder={job.template.name}
                           value={renamingGarment.text}
                           onChange={(e) => setRenamingGarment({ key: job.key, text: e.target.value })}
                           onBlur={saveGarmentName}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter') { e.preventDefault(); saveGarmentName(); }
                             if (e.key === 'Escape') setRenamingGarment(null);
                           }}
                           style={{ maxWidth: '280px', padding: '4px 8px' }} />
                  ) : (
                    <div className="wz-garment-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {garmentLabel(job)}
                      <button type="button" className="btn-secondary at-btn-sm"
                              title={t('wizard.renameGarment', 'Rename this garment on this order')}
                              aria-label={t('wizard.renameGarment', 'Rename this garment on this order')}
                              style={{ padding: '2px 6px', minHeight: 0 }}
                              onClick={() => setRenamingGarment({ key: job.key, text: job.label || '' })}>
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                  <div className="wz-garment-sub">
                    {job.label ? `${job.template.name} · ` : ''}{t('wizard.whatDoesItNeed', 'What does it need?')}
                  </div>
                </div>
                <button type="button" className="btn-secondary at-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => removeGarment(job.key)}>
                  <Trash2 size={12} /> {t('common.remove', 'Remove')}
                </button>
              </div>

              {/* How many of this garment, asked first -- the customer says
                  "three sarees" before anything else. [+] adds one of the same
                  design that follows this one as it is filled; a follower says
                  so instead. A paired garment (a saree's blouse) is counted
                  with its saree, so it shows neither. */}
              {(() => {
                const source = job.sameAs && garmentJobs.find(j => j.key === job.sameAs);
                if (source) {
                  return (
                    <div className="od-hint wz-same-hint">
                      <Copy size={13} style={{ verticalAlign: '-2px' }} />{' '}
                      {t('wizard.sameDesignAs', 'Same design as {name}: filled in from it as you go. Change anything here and this one becomes its own design.', { name: garmentLabel(source) })}
                    </div>
                  );
                }
                if (job.pairedWith) return null;
                const total = garmentJobs.filter(j => j.template?.key === job.template?.key).length;
                const followers = garmentJobs.filter(j => j.sameAs === job.key).length;
                return (
                  <div className="wz-qty">
                    <span className="wz-qty-label">
                      {t('wizard.howMany', 'How many {name}?', { name: job.template.name })}
                    </span>
                    <span className="wz-qty-stepper">
                      <button type="button" className="wz-qty-btn" disabled={!followers}
                              aria-label={t('wizard.oneFewer', 'One fewer of the same design')} onClick={() => dropFollower(job.key)}>−</button>
                      <span aria-live="polite" className="wz-qty-num">{total}</span>
                      <button type="button" className="wz-qty-btn"
                              aria-label={t('wizard.oneMoreSame', 'One more, same design')} onClick={() => copyGarment(job.key)}>+</button>
                    </span>
                    <button type="button" className="btn-secondary at-btn-sm wz-qty-other"
                            disabled={!!addingGarmentKey} onClick={() => addAnotherOf(job)}>
                      <Plus size={12} /> {t('wizard.anotherDifferent', 'One with a different design')}
                    </button>
                    {followers > 0 && (
                      <div className="od-hint wz-qty-hint">
                        {t('wizard.followersHint', '{n} more with the same design: whatever you fill here is copied to them. Change one and it becomes its own design.', { n: followers })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <details open className="wz-sec wz-sec--first">
                <summary className="wz-sec-head">
                  <span className="wz-sec-icon" aria-hidden><ClipboardList size={17} /></span>
                  <span className="wz-sec-titles">
                    <span className="wz-sec-title">{t('wizard.detailsTitle', 'Details')}</span>
                    <span className="wz-sec-sub">{t('wizard.detailsSub', 'The style, and anything special')}</span>
                  </span>
                  <ChevronDown size={18} className="wz-sec-chev" aria-hidden />
                </summary>
              {sections.map((sectionKey) => (
                <div key={sectionKey} className="wz-garment-section">
                  <TemplateForm template={job.template} section={sectionKey} values={job.values}
                                errors={garmentErrors[job.key] || {}} only={upFront}
                                voiceFor={MAGGAM_NOTE_VOICE}
                                purchases={job.purchases || []} onPurchaseChange={(fieldKey, row) => updateGarmentPurchase(job.key, fieldKey, row)}
                                onChange={(values) => updateGarmentValues(job.key, values)} />
                </div>
              ))}

              {/* Anything the options above have no box for, in the
                  customer's own words. The template's own
                  special_instructions field (Production Notes), so it
                  is validated and stored with the garment's spec and
                  the tailor reads it on the garment's brief. */}
              <div className="wz-garment-section">
                <div className="od-hint" style={{ marginBottom: '6px' }}>
                  {t('wizard.garmentNoteHint', 'Anything the options above don’t cover? Write it here.')}
                </div>
                <TemplateForm template={job.template} section="production" values={job.values}
                              errors={garmentErrors[job.key] || {}} only={(f) => f.key === 'special_instructions'}
                              plainTextarea
                              onChange={(values) => updateGarmentValues(job.key, values)} />
                {/* This garment's own voice note, recorded the way the
                    measurements note is: record, hear it, Send or Delete.
                    Kept in the template's `audio_note` field, so it is
                    stored with the garment and played on its summary. */}
                {job.template.sections.some(sec => sec.fields.some(f => f.key === 'audio_note')) && (
                  /* Up to ten, kept as a list ([{ url, by, at }]); a garment
                     saved before keeps its one clip (a URL) as the first. */
                  <VoiceRecorder
                    notes={voiceNoteList(job.values?.audio_note)}
                    onSend={async (blob) => {
                      const url = await api.uploadVoiceNote(blob);
                      const by = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.name || currentUser?.email || '';
                      setGarmentJobs(prev => prev.map(j => (j.key === job.key
                        ? { ...j, values: { ...j.values, audio_note: [...voiceNoteList(j.values?.audio_note), { url, by, at: new Date().toISOString() }] } } : j)));
                    }}
                    onDelete={(index) => setGarmentJobs(prev => prev.map(j => {
                      if (j.key !== job.key) return j;
                      const rest = { ...j.values };
                      const left = voiceNoteList(j.values?.audio_note).filter((_, i) => i !== index);
                      if (left.length) rest.audio_note = left; else delete rest.audio_note;
                      return { ...j, values: rest };
                    }))}
                  />
                )}
              </div>
              </details>

              {/* THE LOOK: part of this garment's own card, under its details. */}
              <details id={`wz-design-${job.key}`} className="wz-sec">
                <summary className="wz-sec-head">
                  <span className="wz-sec-icon" aria-hidden><Palette size={17} /></span>
                  <span className="wz-sec-titles">
                    <span className="wz-sec-title">{t('wizard.designTitle', 'Choose design')}</span>
                    <span className="wz-sec-sub">{t('wizard.designSub', 'How the look is decided, plus trims')}</span>
                  </span>
                  <ChevronDown size={18} className="wz-sec-chev" aria-hidden />
                </summary>

              {/* A petticoat is not designed: its styles as pictures, in
                  place of the three cards. The choice is the template's
                  petticoat_style, saved with the garment's other details. */}
              {job.template?.key === 'petticoat' ? (
                <PetticoatStylePicker value={job.values?.petticoat_style || ''}
                                      onChange={(style) => updateGarmentValues(job.key, { ...(job.values || {}), petticoat_style: style })} />
              ) : (
              /* The three ways to choose a design, side by side; a narrow screen stacks them as rows. */
              <div className="wz-dchoices">
                <div className="od-hint wz-dchoices-hint">{t('wizard.designChoiceHint', 'Use one or more: a look from our catalogue, the customer’s own photos, or a new design by our designer.')}</div>
                <button
                  type="button"
                  className={`wz-dchoice${ partSelection[job.key] && Object.keys(partSelection[job.key]).length > 0 ? ' wz-dchoice--on' : '' }`}
                  onClick={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: 'catalogue' }))}
                >
                  <IconTile icon={Sparkles} tone={partSelection[job.key] && Object.keys(partSelection[job.key]).length > 0 ? 'green' : 'neutral'} size={40} iconSize={19} className="wz-dchoice-icon" />
                  <span className="wz-dchoice-title">{t('wizard.sheetCatalogue', 'Pick a look from our catalogue')}</span>
                  <span className="wz-dchoice-desc">Browse and choose design looks directly from your boutique catalogue.</span>
                  {partSelection[job.key] && Object.keys(partSelection[job.key]).length > 0 ? (
                    <span className="wz-dchoice-status wz-dchoice-status--on">✓ Design selected (Click to view/change)</span>
                  ) : (
                    <span className="wz-dchoice-status">Click to open catalogue →</span>
                  )}
                </button>

                <button
                  type="button"
                  className={`wz-dchoice${ partReferences[job.key] && Object.values(partReferences[job.key]).flat().length > 0 ? ' wz-dchoice--on' : '' }`}
                  onClick={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: 'references' }))}
                >
                  <IconTile icon={Camera} tone={partReferences[job.key] && Object.values(partReferences[job.key]).flat().length > 0 ? 'amber' : 'neutral'} size={40} iconSize={19} className="wz-dchoice-icon" />
                  <span className="wz-dchoice-title">{t('wizard.sheetPhotos', 'Photos & references from customer')}</span>
                  <span className="wz-dchoice-desc">Upload customer photos or add web links as reference for this garment.</span>
                  {partReferences[job.key] && Object.values(partReferences[job.key]).flat().length > 0 ? (
                    <span className="wz-dchoice-status wz-dchoice-status--on">
                      ✓ {Object.values(partReferences[job.key]).flat().length} reference(s) added
                    </span>
                  ) : (
                    <span className="wz-dchoice-status">Click to add photos or links →</span>
                  )}
                </button>

                {/* A new design by our designer: what used to be its own
                    door on the New order screen. It is the whole order's
                    choice (a designer is assigned once, for the order). */}
                <button
                  type="button"
                  className={`wz-dchoice${serviceType === 'design' ? ' wz-dchoice--on' : ''}`}
                  aria-pressed={serviceType === 'design'}
                  onClick={() => setServiceType(prev => (prev === 'design' ? 'stitch' : 'design'))}
                >
                  <IconTile icon={PenTool} tone={serviceType === 'design' ? 'green' : 'neutral'} size={40} iconSize={19} className="wz-dchoice-icon" />
                  <span className="wz-dchoice-title">{t('entry.serviceDesign', 'Design something new')}</span>
                  <span className="wz-dchoice-desc">{t('entry.serviceDesignDesc', 'Our designer draws it for the customer, then we stitch it.')}</span>
                  {serviceType === 'design' ? (
                    <span className="wz-dchoice-status wz-dchoice-status--on">✓ {t('wizard.designerChosenBelow', 'Pick the designer below (click to undo)')}</span>
                  ) : (
                    <span className="wz-dchoice-status">{t('wizard.askDesigner', 'Click to ask our designer →')}</span>
                  )}
                </button>
              </div>
              )}

              {/* Everything picked for this garment, split by where it
                  came from -- our catalogue, or the customer -- each
                  picture named by the part it was kept on. */}
              {(() => {
                const declared = job.template?.design_parts || [];
                const order = new Map(declared.map((p, i) => [p.key, i]));
                const label = (k) => declared.find(p => p.key === k)?.label || k.replace(/_/g, ' ');
                const byPart = ([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99);
                const ours = Object.entries(job.design?.parts || {}).sort(byPart)
                  .filter(([, img]) => img?.image_url)
                  .map(([k, img]) => ({ key: `pick:${k}`, src: img.image_url, part: label(k), sub: img.design_title || '' }));
                const theirs = Object.entries(job.design?.part_refs || {}).sort(byPart)
                  .flatMap(([k, list]) => (list || []).filter(r => r?.image_url).map(r => ({
                    key: `ref:${k}:${r.id}`, src: r.image_url, part: label(k),
                    sub: r.source === 'customer_link' ? t('wizard.customerLink', 'Link') : (r.design_title || t('wizard.customerPhoto', 'Photo')),
                  })));
                if (!ours.length && !theirs.length) return null;
                const group = (title, items) => items.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>{title} <span className="od-hint">· {items.length}</span></div>
                    <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                      {items.map(it => (
                        <a key={it.key} href={resolveMediaUrl(it.src)} target="_blank" rel="noopener noreferrer"
                           style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--border-color)',
                                    borderRadius: '10px', overflow: 'hidden', background: 'var(--surface-color)' }}>
                          <img src={resolveMediaUrl(it.src)} alt={it.part} loading="lazy"
                               style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
                          <div style={{ padding: '5px 7px' }}>
                            <div style={{ fontSize: '11.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.part}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                );
                return (
                  <div className="wz-garment-section">
                    <div className="ui-eyebrow">{t('wizard.chosenForGarment', 'Chosen for this {name}', { name: job.template.name })}</div>
                    {group(t('wizard.fromOurCatalogue', 'From our catalogue'), ours)}
                    {group(t('wizard.fromCustomer', 'Uploaded by the customer'), theirs)}
                  </div>
                );
              })()}

              {activeDesignTab[job.key] === 'catalogue' && (
                <FormModal
                  icon={Sparkles}
                  tone="green"
                  title={`Catalogue Looks — ${job.template?.name || job.key}`}
                  subtitle="Browse and choose design looks directly from your boutique catalogue."
                  width="960px"
                  onClose={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: null }))}
                  footer={
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '8px 24px', fontSize: '13px' }}
                      onClick={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: null }))}
                    >
                      Done
                    </button>
                  }
                >
                  <Suspense fallback={<ScreenLoading />}>
                    <GarmentPartPicker
                      garmentKey={job.template?.key || job.key}
                      garmentName={job.template?.name || job.key}
                      selection={partSelection[job.key] || {}}
                      onChange={(next) => handlePartSelection(job.key, next)} />
                  </Suspense>
                </FormModal>
              )}

              {activeDesignTab[job.key] === 'references' && (
                <FormModal
                  icon={Camera}
                  tone="amber"
                  title={`Customer References — ${job.template?.name || job.key}`}
                  subtitle="Upload customer photos or add web links as reference for this garment."
                  width="920px"
                  onClose={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: null }))}
                  footer={
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '8px 24px', fontSize: '13px' }}
                      onClick={() => setActiveDesignTab(prev => ({ ...prev, [job.key]: null }))}
                    >
                      Done
                    </button>
                  }
                >
                  <Suspense fallback={<ScreenLoading />}>
                    <GarmentPartPicker ownOnly
                                       withoutWork={!job.values?.hand_work || job.values.hand_work === 'none'}
                                       garmentKey={job.template?.key || job.key}
                                       garmentName={job.template?.name || job.key}
                                       references={partReferences[job.key] || {}}
                                       onReferencesChange={(next) => handlePartReferences(job.key, next)} />
                  </Suspense>
                </FormModal>
              )}

        {serviceType === 'design' && (
          <div className="wz-designer">
            <div className="wz-garment-head"><div className="wz-garment-name">{t('wizard.designerTitle', 'Who will design it?')}</div></div>
            {/* No designer on the team: the person taking the order
                designs it ("Me"), the only choice. */}
            <div className="form-group">
              <label className="form-label" htmlFor="wz-designer">{t('wizard.designer', 'Designer')} <span className="required">*</span></label>
              <select id="wz-designer" className="form-control" value={designerChoice}
                      style={{ maxWidth: '320px' }}
                      onChange={(e) => setDesignRequest({ ...designRequest, designer: e.target.value })}>
                {designers.length === 0 ? (
                  <option value={SELF_DESIGNER}>{selfDesignerLabel}</option>
                ) : (
                  <>
                    <option value="">{t('wizard.pickDesigner', 'Pick a designer')}</option>
                    {designers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.specialisation ? ` · ${d.specialisation}` : ''}</option>)}
                    {/* A draft saved as "Me" before the team had a designer. */}
                    {designerChoice === SELF_DESIGNER && <option value={SELF_DESIGNER}>{selfDesignerLabel}</option>}
                  </>
                )}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="wz-brief">{t('wizard.brief', 'What does the customer want?')}</label>
              <textarea id="wz-brief" className="form-control" rows={4} value={designRequest.brief} maxLength={LIMITS.note}
                        onChange={(e) => setDesignRequest({ ...designRequest, brief: e.target.value })}
                        placeholder={t('wizard.briefPlaceholder', 'e.g. A peplum blouse with a scalloped hem, in the green of the saree border.')} />
              {/* Or say it: the same recorder the tailor's notes use. Text,
                  a voice note or both; the clip is held on the draft and
                  reaches the designer with the brief at confirm. */}
              {/* Up to ten: each Send adds one (voice_notes); a draft
                  from before keeps its one voice_note as the first. */}
              <VoiceRecorder
                notes={voiceNoteList(designRequest.voice_notes, designRequest.voice_note)}
                onSend={async (blob) => {
                  const url = await api.uploadVoiceNote(blob);
                  const by = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.name || currentUser?.email || '';
                  setDesignRequest(prev => ({ ...prev, voice_note: null,
                    voice_notes: [...voiceNoteList(prev.voice_notes, prev.voice_note), { url, by, at: new Date().toISOString() }] }));
                }}
                onDelete={(index) => setDesignRequest(prev => ({ ...prev, voice_note: null,
                  voice_notes: voiceNoteList(prev.voice_notes, prev.voice_note).filter((_, i) => i !== index) }))}
              />
            </div>
          </div>
        )}

              {/* Trims and accessories belong to the look, so they sit
                  under Design rather than Fabric (MOM, 2026-10-24). */}
              <details className="wz-more wz-trims">
                <summary><Package size={14} /> {t('wizard.sheetTrims', 'Trims & accessories')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                {canSeeTab(currentUser, 'inventory') && (
                  <details className="wz-more wz-trims-group" open>
                    <summary><Package size={14} /> {t('wizard.sheetBoutiqueAccessories', 'Boutique Accessories & Trims')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                    <Suspense fallback={<ScreenLoading />}>
                      <GarmentFabricPicker
                        garmentJobs={[job]}
                        fabrics={fabrics}
                        taxonomy={fabricTaxonomy}
                        selection={fabricSelection}
                        onChange={handleFabricSelection}
                        accessoryDetails={{ [job.key]: job.accessories || {} }}
                        onAccessoryDetailsChange={(jobKey, next) => setGarmentJobs(prev => prev.map(j => (j.key === jobKey ? { ...j, accessories: next } : j)))}
                        accessoriesOnly />
                    </Suspense>
                  </details>
                )}
                <details className="wz-more wz-trims-group" open>
                  <summary><Package size={14} /> {t('wizard.sheetCustomerAccessories', 'Customer Accessories (My Accessories)')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                  <Suspense fallback={<ScreenLoading />}>
                    <GarmentPartPicker ownOnly isFabric accessoriesOnly
                                       garmentKey={job.template?.key || job.key}
                                       garmentName={job.template?.name || job.key}
                                       taxonomy={fabricTaxonomy}
                                       references={partReferences[job.key] || {}}
                                       onReferencesChange={(next) => handlePartReferences(job.key, next)} />
                  </Suspense>
                </details>
              </details>
              </details>

              {/* FABRIC: part of this garment's own card, under its details. */}
              <details id={`wz-fabric-${job.key}`} className="wz-sec">
                <summary className="wz-sec-head">
                  <span className="wz-sec-icon" aria-hidden><Layers size={17} /></span>
                  <span className="wz-sec-titles">
                    <span className="wz-sec-title">{t('wizard.fabricTitle', 'Choose fabric')}</span>
                    <span className="wz-sec-sub">{t('wizard.fabricSub', 'Where the cloth comes from')}</span>
                  </span>
                  <ChevronDown size={18} className="wz-sec-chev" aria-hidden />
                </summary>

              {/* Where the cloth comes from -- the template's own
                  fabric_source field, so it travels with the garment. */}
              {job.template.sections.some((sec) => sec.key === 'materials') && (
                <div className="wz-garment-section">
                  <TemplateForm template={job.template} section="materials" values={job.values}
                                errors={garmentErrors[job.key] || {}} only={(f) => f.key === 'fabric_source'}
                                onChange={(values) => {
                                  updateGarmentValues(job.key, values);
                                  // "Need to buy": open a row below to say what and how much,
                                  // unless one is open already. Left blank, it is not recorded.
                                  if (values.fabric_source === 'buy' && (job.values?.fabric_source || 'inventory') !== 'buy'
                                      && !(job.purchases || []).some(r => !r.field_key)) {
                                    setGarmentJobs(prev => prev.map(j => (j.key === job.key
                                      ? { ...j, purchases: [...(j.purchases || []), { name: '', quantity: '', unit: 'METER', estimated_cost: '', required_by: '', notes: '' }] }
                                      : j)));
                                  }
                                }} />
                </div>
              )}

              {/* From our inventory, where this boutique has no fabric stock to
                  pick from (its plan has no Inventory): say so, not a blank space. */}
              {!canSeeTab(currentUser, 'inventory') && (job.values?.fabric_source || 'inventory') === 'inventory' && (
                <p className="od-hint" style={{ margin: '4px 0 10px' }}>
                  {t('wizard.noInventoryModule', 'Fabric stock is not part of this boutique’s plan, so there is no shelf to pick from here. The workroom will choose the fabric — or choose “Need to buy” to note what to buy.')}
                </p>
              )}

              {canSeeTab(currentUser, 'inventory') && (job.values?.fabric_source || 'inventory') === 'inventory' && (
                <details className="wz-more" open>
                  <summary><Layers size={14} /> {t('wizard.sheetFabric', 'Fabric from our stock')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
                  <Suspense fallback={<ScreenLoading />}>
                    {fabrics.length === 0 ? (
                      <p className="od-hint" style={{ margin: '10px 0 0' }}>{t('wizard.noFabricInStock', 'No fabric in stock yet. The workroom can pick a roll later.')}</p>
                    ) : (
                      <>
                        <FabricColorFilter fabrics={fabrics} value={fabricColorQuery} onChange={setFabricColorQuery} />
                        <GarmentFabricPicker
                          garmentJobs={[job]}
                          fabrics={colourFilteredFabrics}
                          taxonomy={fabricTaxonomy}
                          selection={fabricSelection}
                          onChange={handleFabricSelection} />
                      </>
                    )}
                  </Suspense>
                </details>
              )}

              {(job.values?.fabric_source || 'inventory') === 'buy' && (
                <p className="od-hint" style={{ margin: '4px 0 10px' }}>
                  {t('wizard.fabricToBuy', 'To be bought for this order. Note what and how much under Trims & accessories, or in the notes for the tailor.')}
                </p>
              )}

              {/* Something the customer wants that the shelf does not
                  hold: bought for this order, tracked in Inventory →
                  To buy for orders. Never stock. */}
              <div className="wz-garment-section">
                <GarmentPurchases rows={job.purchases || []}
                                  onChange={(rows) => setGarmentJobs(prev => prev.map(j => (j.key === job.key ? { ...j, purchases: rows } : j)))} />
              </div>
              {/* The customer's own cloth, part by part: only once the
                  Fabric question says the customer provides it. */}
              {(job.values?.fabric_source || 'inventory') === 'customer' && (
                <details className="wz-more" open>
                  <summary><Layers size={14} /> {t('wizard.sheetCustomerFabric', 'Fabric the customer is bringing')}</summary>
                  <Suspense fallback={<ScreenLoading />}>
                    <GarmentPartPicker ownOnly isFabric
                                       garmentKey={job.template?.key || job.key}
                                       garmentName={job.template?.name || job.key}
                                       taxonomy={fabricTaxonomy}
                                       references={partReferences[job.key] || {}}
                                       onReferencesChange={(next) => handlePartReferences(job.key, next)} />
                  </Suspense>
                </details>
              )}

              </details>

              {/* Move between garments from where the form ends, not
                  from the circles at the top. "Next" runs the footer's
                  own Next: same checks, same save, same next garment. */}
              {garmentJobs.length > 1 && (() => {
                const done = [...new Set([...garmentsDone, job.key])];
                const nextJob = [...garmentJobs.slice(idx + 1), ...garmentJobs.slice(0, idx)].find(j => !done.includes(j.key));
                const prevJob = garmentJobs[idx - 1];
                if (!nextJob && !prevJob) return null;
                return (
                  <div className="wz-gnav">
                    {prevJob ? (
                      <button type="button" className="btn-secondary" onClick={() => openGarmentAt(prevJob.key)}>
                        <ArrowLeft size={16} /> {garmentLabel(prevJob)}
                      </button>
                    ) : <span />}
                    {nextJob && (
                      <button type="button" className="btn-primary" onClick={handleNext} disabled={ctaBusy}>
                        {t('wizard.nextGarment', 'Next garment')}: {garmentLabel(nextJob)} <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                );
              })()}

            </div>
          );
        })}

        {/* Another garment, once this one is filled in. */}
        {garmentJobs.length > 0 && (
          <details ref={addMoreGarmentsRef} className="wz-more wz-addmore">
            <summary><Plus size={14} /> {t('wizard.addMoreGarments', 'Add more garments to this order')}</summary>
            <div style={{ marginTop: '10px' }}>
              <DressesDropdown compact
                title={t('wizard.addMoreGarments', 'Add more garments to this order')}
                garmentTemplates={garmentsForGender(garmentTemplates, customerForm.gender)}
                garmentJobs={garmentJobs}
                addingGarmentKey={addingGarmentKey}
                garmentTemplatesError={garmentTemplatesError}
                loadGarmentTemplates={loadGarmentTemplates}
                addGarments={async (keys) => {
                  await addGarments(keys);
                  if (addMoreGarmentsRef.current) addMoreGarmentsRef.current.open = false;
                }}
              />
            </div>
          </details>
        )}

      </div>
      </div>
    </>
  );
}
