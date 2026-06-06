export const PROCESS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'game', label: 'Game' },
  { id: 'jailed', label: 'Jailed' },
  { id: 'foreground', label: 'Foreground' },
  { id: 'protected', label: 'Protected' }
];

export const PROCESS_STATUS_LABELS = {
  game: 'Game',
  jailed: 'Jailed',
  foreground: 'Foreground',
  protected: 'Protected',
  tracked: 'Tracked'
};

export const PRIORITY_CLASS_LABELS = {
  32: 'Normal',
  64: 'Idle',
  128: 'High',
  256: 'Realtime',
  16384: 'Below normal',
  32768: 'Above normal'
};
