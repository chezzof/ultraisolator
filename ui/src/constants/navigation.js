import DashboardIcon from '@carbon/icons-react/es/Dashboard.js';
import SettingsIcon from '@carbon/icons-react/es/Settings.js';
import ChipIcon from '@carbon/icons-react/es/Chip.js';
import DocumentIcon from '@carbon/icons-react/es/Document.js';

export const PAGES = [
  {
    id: 'dashboard',
    labelKey: 'nav.dashboard',
    label: 'Overview',
    title: 'Overview',
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
    label: 'CPU Map',
    title: 'CPU Map',
    renderIcon: ChipIcon
  },
  {
    id: 'logs',
    labelKey: 'nav.logs',
    label: 'Activity',
    title: 'Activity',
    renderIcon: DocumentIcon
  },
  {
    id: 'advanced',
    labelKey: 'nav.advanced',
    label: 'Advanced',
    title: 'Advanced',
    renderIcon: SettingsIcon
  }
];
