import type { ChangeEvent } from 'react';
import type { NoteSurfaceSettings, NoteSurfaceSettingsPatch, SettingsSheetStatus } from '../state/useNoteSurfaceFlow.ts';

interface SettingsSheetProps {
  open: boolean;
  settings: NoteSurfaceSettings;
  status: SettingsSheetStatus;
  onUpdateSettings(patch: NoteSurfaceSettingsPatch): void;
  onClose(): void;
}

export function SettingsSheet({ open, settings, status, onUpdateSettings, onClose }: SettingsSheetProps) {
  if (!open) {
    return null;
  }

  const updateBoolean = (field: keyof Pick<
    NoteSurfaceSettings,
    'authoringShortcutsEnabled' | 'focusNewNoteBody' | 'digestAutoOpen' | 'memoryCandidatesVisible' | 'sourceButtonsAlwaysVisible'
  >) => (event: ChangeEvent<HTMLInputElement>) => {
    onUpdateSettings({ [field]: event.currentTarget.checked });
  };

  return (
    <aside className="ann-settings-sheet" aria-label="設定" data-component="settings-sheet">
      <header className="ann-settings-sheet__header">
        <div>
          <h2>設定</h2>
          <p>書く面を中心に保つための調整</p>
        </div>
        <button type="button" className="ann-icon-button" aria-label="設定を閉じる" onClick={onClose}>×</button>
      </header>

      <section className="ann-settings-section" aria-labelledby="settings-writing">
        <h3 id="settings-writing">書く</h3>
        <SettingToggle
          label="Markdown ショートカット"
          checked={settings.authoringShortcutsEnabled}
          onChange={updateBoolean('authoringShortcutsEnabled')}
        />
        <SettingToggle
          label="新規メモで本文へフォーカス"
          checked={settings.focusNewNoteBody}
          onChange={updateBoolean('focusNewNoteBody')}
        />
        <SettingRadioGroup
          label="行間"
          name="writing-density"
          value={settings.writingDensity}
          options={[
            { value: 'standard', label: '標準' },
            { value: 'spacious', label: 'ゆったり' },
          ]}
          onChange={(value) => onUpdateSettings({ writingDensity: value as NoteSurfaceSettings['writingDensity'] })}
        />
      </section>

      <section className="ann-settings-section" aria-labelledby="settings-organization">
        <h3 id="settings-organization">戻ってくる整理</h3>
        <SettingToggle
          label="整理結果を自動で開く"
          checked={settings.digestAutoOpen}
          onChange={updateBoolean('digestAutoOpen')}
        />
        <StatusRow label="整理状態" value={status.digestStatus} />
        <StatusRow label="保存" value={status.localDraftStatus} />
      </section>

      <section className="ann-settings-section" aria-labelledby="settings-memory">
        <h3 id="settings-memory">記憶</h3>
        <SettingToggle
          label="記憶候補を表示"
          checked={settings.memoryCandidatesVisible}
          onChange={updateBoolean('memoryCandidatesVisible')}
        />
        <StatusRow label="安全ルール" value="確認なしで有効化しない" />
        <StatusRow label="除外" value="違う・削除した記憶は使わない" />
      </section>

      <section className="ann-settings-section" aria-labelledby="settings-trust">
        <h3 id="settings-trust">信頼と出典</h3>
        <SettingToggle
          label="出典ボタンを常に表示"
          checked={settings.sourceButtonsAlwaysVisible}
          onChange={updateBoolean('sourceButtonsAlwaysVisible')}
        />
        <StatusRow label="出典" value="範囲があるときだけ表示" />
        <StatusRow label="AI 由来" value="本文と区別して表示" />
      </section>

      <section className="ann-settings-section" aria-labelledby="settings-display">
        <h3 id="settings-display">表示</h3>
        <SettingRadioGroup
          label="テーマ"
          name="theme"
          value={settings.theme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(value) => onUpdateSettings({ theme: value as NoteSurfaceSettings['theme'] })}
        />
        <SettingRadioGroup
          label="位置"
          name="settings-position"
          value={settings.settingsSheetPosition}
          options={[
            { value: 'left', label: '左' },
            { value: 'right', label: '右' },
          ]}
          onChange={(value) => onUpdateSettings({ settingsSheetPosition: value as NoteSurfaceSettings['settingsSheetPosition'] })}
        />
        <SettingRadioGroup
          label="動き"
          name="motion"
          value={settings.motion}
          options={[
            { value: 'system', label: 'System' },
            { value: 'reduced', label: '控えめ' },
          ]}
          onChange={(value) => onUpdateSettings({ motion: value as NoteSurfaceSettings['motion'] })}
        />
      </section>
    </aside>
  );
}

function SettingToggle({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange(event: ChangeEvent<HTMLInputElement>): void;
}) {
  return (
    <label className="ann-settings-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}

function SettingRadioGroup<TValue extends string>({ label, name, value, options, onChange }: {
  label: string;
  name: string;
  value: TValue;
  options: readonly { value: TValue; label: string }[];
  onChange(value: TValue): void;
}) {
  return (
    <fieldset className="ann-settings-segmented">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ann-settings-status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
