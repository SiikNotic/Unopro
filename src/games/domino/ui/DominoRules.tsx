import { useI18n } from '@/i18n';

/** The rules exactly as the engine applies them (docs/games-platform.md has the same text). */
export function DominoRules() {
  const { t } = useI18n();
  const items = (key: string) => (t(key) as string).split('\n');
  return (
    <div className="dm-rules">
      <p>{t('domino.rules.intro')}</p>
      {(['setup', 'turn', 'end', 'score'] as const).map((k) => (
        <section key={k}>
          <h3>{t(`domino.rules.${k}Title`)}</h3>
          <ul>
            {items(`domino.rules.${k}`).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
