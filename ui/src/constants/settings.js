export const APP_SETTINGS_STORAGE_KEY = 'eii_app_settings';

export const DEFAULT_APP_SETTINGS = {
  language: 'en',
  launchAtWindowsStartup: false,
  minimizeToTrayOnStart: false,
  startIsolatorAutomatically: false,
  notificationToastsEnabled: true,
  firstRunCompleted: false
};

export const CONFIG_PRESETS = [
  {
    id: 'competitive',
    label: 'Competitive',
    detail: 'Fast active polling, background jailing enabled, aggressive anti-cheat policy.',
    config: {
      poll_interval_active_ms: 2000,
      enable_background_jailing: true,
      anti_cheat_mode: 'aggressive',
      maintenance_jail_batch_size: 4,
      maintenance_jail_interval_ms: 30000,
      maintenance_jail_batch_cooldown_ms: 5000,
      housekeeping_cores: 1
    }
  },
  {
    id: 'casual',
    label: 'Casual',
    detail: 'Lower UI/runtime activity and no background jailing by default.',
    config: {
      poll_interval_active_ms: 5000,
      enable_background_jailing: false,
      anti_cheat_mode: 'conservative',
      maintenance_jail_batch_size: 2,
      maintenance_jail_interval_ms: 30000,
      maintenance_jail_batch_cooldown_ms: 5000,
      housekeeping_cores: 1
    }
  },
  {
    id: 'streaming',
    label: 'Streaming',
    detail: 'Keeps extra housekeeping room for capture, chat, and encoder tools.',
    config: {
      poll_interval_active_ms: 3000,
      enable_background_jailing: true,
      anti_cheat_mode: 'aggressive',
      maintenance_jail_batch_size: 3,
      maintenance_jail_interval_ms: 30000,
      maintenance_jail_batch_cooldown_ms: 5000,
      housekeeping_cores: 2
    }
  }
];

export const CONFIG_SECTIONS = [
  {
    title: 'Game Detection',
    fields: ['games', 'auto_detect_steam_games', 'auto_detect_epic_games', 'steam_library_paths', 'epic_library_paths']
  },
  {
    title: 'Jailing',
    fields: [
      'enable_background_jailing',
      'maintenance_jail_batch_size',
      'maintenance_jail_interval_ms',
      'maintenance_jail_batch_cooldown_ms',
      'maintenance_skip_after_quiet_cycles'
    ]
  },
  {
    title: 'Timing',
    fields: [
      'poll_interval_active_ms',
      'poll_interval_idle_ms',
      'housekeeping_cores',
      'game_close_debounce_s',
      'game_exit_restore_delay_s',
      'gc_full_collect_interval_s'
    ]
  },
  {
    title: 'Protection',
    fields: [
      'disable_power_scheme_switch',
      'disable_timer_resolution_tweak',
      'disable_game_priority_boost',
      'anti_cheat_mode',
      'protected_extra'
    ]
  },
  {
    title: 'Advanced',
    fields: [
      'hot_thread_limit',
      'thread_sample_window_ms',
      'enable_hot_thread_tuning',
      'hot_thread_refresh_ms',
      'event_backend',
      'allow_mmcss_injection',
      'log_file'
    ]
  }
];

export const FIELD_LABELS = {
  games: 'Games',
  auto_detect_steam_games: 'Auto-detect Steam games',
  auto_detect_epic_games: 'Auto-detect Epic games',
  steam_library_paths: 'Steam library paths',
  epic_library_paths: 'Epic library paths',
  enable_background_jailing: 'Enable background jailing',
  maintenance_jail_batch_size: 'Maintenance jail batch size',
  maintenance_jail_interval_ms: 'Maintenance jail interval',
  maintenance_jail_batch_cooldown_ms: 'Maintenance jail cooldown',
  maintenance_skip_after_quiet_cycles: 'Skip after quiet cycles',
  poll_interval_active_ms: 'Active poll interval',
  poll_interval_idle_ms: 'Idle poll interval',
  housekeeping_cores: 'Housekeeping cores',
  disable_power_scheme_switch: 'Disable power scheme switch',
  disable_timer_resolution_tweak: 'Disable timer resolution tweak',
  disable_game_priority_boost: 'Disable game priority boost',
  game_close_debounce_s: 'Game close debounce',
  game_exit_restore_delay_s: 'Game exit restore delay',
  gc_full_collect_interval_s: 'Full GC collect interval',
  anti_cheat_mode: 'Anti-cheat mode',
  protected_extra: 'Protected extra',
  log_file: 'Log file',
  hot_thread_limit: 'Hot thread limit',
  thread_sample_window_ms: 'Thread sample window',
  enable_hot_thread_tuning: 'Enable hot thread tuning',
  hot_thread_refresh_ms: 'Hot thread refresh',
  event_backend: 'Event backend',
  allow_mmcss_injection: 'Allow MMCSS injection'
};

export const FIELD_HINTS = {
  games: 'One executable per line. Bare names are normalized to .exe by the API.',
  steam_library_paths: 'One Steam library path per line.',
  epic_library_paths: 'One Epic library path per line.',
  protected_extra: 'Processes that must never be jailed, one name per line.',
  log_file: 'Leave empty to disable file logging.',
  enable_hot_thread_tuning: 'Keep disabled for competitive mode unless explicitly testing.',
  allow_mmcss_injection: 'Advanced Windows multimedia scheduler hook.'
};
