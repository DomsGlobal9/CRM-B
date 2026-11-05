import { Clock, Crown, FileText, Globe, KeyRound, MessageSquare, ShieldCheck, SunMoon, User } from 'lucide-react';

/** What each settings popup says at its top: its title, subtitle, icon and width. */

export const getModalConfig = (activeModal, t) => {
  switch (activeModal) {
    case 'name':
      return {
        title: t('settingsPage.editNameTitle', 'Edit name'),
        subtitle: t('settingsPage.editNameDesc', 'The name shown on your account.'),
        icon: User,
        maxWidth: '520px',
      };
    case 'password':
      return {
        title: t('settingsPage.changePasswordTitle', 'Change password'),
        subtitle: t('settingsPage.changePasswordDesc', 'Enter your current password, then choose a new one.'),
        icon: KeyRound,
        maxWidth: '520px',
      };
    case 'language':
      return {
        title: t('settingsPage.languageSectionTitle', 'Language & Regional'),
        subtitle: t('settingsPage.languageSectionDesc', 'Select your preferred interface display language'),
        icon: Globe,
        maxWidth: '680px',
      };
    case 'appearance':
      return {
        title: t('settingsPage.appearanceTitle', 'Appearance & Theme'),
        subtitle: t('settingsPage.appearanceDesc', 'Light or dark, customized for this device'),
        icon: SunMoon,
        maxWidth: '680px',
      };
    case 'workspace':
      return {
        title: t('settingsPage.systemSectionTitle', 'Workspace & Boutique Info'),
        subtitle: t('settingsPage.systemSectionDesc', 'Boutique details, active session and sign-in URL'),
        icon: ShieldCheck,
        maxWidth: '580px',
      };
    case 'whatsapp':
      return {
        title: t('settingsPage.whatsappTitle', 'WhatsApp Integration'),
        subtitle: t('settingsPage.whatsappSubtitle', 'Link boutique WhatsApp account for automated messages'),
        icon: MessageSquare,
        maxWidth: '640px',
      };
    case 'invoice':
      return {
        title: t('settingsPage.invoiceTemplateTitle', 'Invoice Template Selection'),
        subtitle: t('settingsPage.invoiceTemplateSubtitle', 'Select design style before generating customer invoices'),
        icon: FileText,
        maxWidth: '740px',
      };
    case 'tiers':
      return {
        title: 'Customer Tiers',
        subtitle: 'Give the three customer tiers your boutique own custom names',
        icon: Crown,
        maxWidth: '580px',
      };
    case 'summary':
      return {
        title: t('summarySettings.title', 'Daily Summary Notifications'),
        subtitle: t('summarySettings.subtitle', 'Each person gets a summary of their work at 11 PM. Choose recipients and language.'),
        icon: Clock,
        maxWidth: '780px',
      };
    default:
      return null;
  }
};
