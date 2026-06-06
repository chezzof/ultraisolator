import DashboardIcon from '@carbon/icons-react/es/Dashboard.js';
import SettingsIcon from '@carbon/icons-react/es/Settings.js';
import ChipIcon from '@carbon/icons-react/es/Chip.js';
import DocumentIcon from '@carbon/icons-react/es/Document.js';

export const PAGES = [
  {
    id: 'dashboard',
    labelKey: 'nav.dashboard',
    label: 'Dashboard',
    title: 'Dashboard',
    renderIcon: DashboardIcon
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    label: 'Settings',
    title: 'Settings',
    renderIcon: SettingsIcon
  },
  {
    id: 'topology',
    labelKey: 'nav.topology',
    label: 'Topology',
    title: 'CPU Topology',
    renderIcon: ChipIcon
  },
  {
    id: 'logs',
    labelKey: 'nav.logs',
    label: 'Logs',
    title: 'Logs',
    renderIcon: DocumentIcon
  },
  {
    id: 'advanced',
    labelKey: 'nav.advanced',
    label: 'Advanced Tools',
    title: 'Advanced Tools',
    renderIcon: SettingsIcon
  }
];
