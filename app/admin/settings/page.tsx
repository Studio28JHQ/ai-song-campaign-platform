import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { appConfig } from "@/config/app";

export const metadata: Metadata = {
  title: "Configuración | Bassa",
};

const SETTINGS: Array<{ label: string; value: string }> = [
  { label: "Nombre de la campaña", value: appConfig.campaign.name },
  { label: "Meta de canciones", value: String(appConfig.campaign.maxSongs) },
  { label: "Intentos máximos de letra", value: String(appConfig.campaign.maxLyricAttempts) },
  {
    label: "Tiempo límite de generación",
    value: `${appConfig.song.generationTimeoutMinutes} min`,
  },
];

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. Read-only display of the
 * campaign's operational settings — never secrets/credentials, only the
 * values that shape the campaign itself (goal, attempt limits, timeout).
 * There is nothing to edit here yet: every value still comes from the
 * environment (see `appConfig`), unchanged by this sprint.
 */
export default function AdminSettingsPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="flex flex-col gap-6">
          <h1 className="text-heading font-bold text-foreground">Configuración</h1>

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SETTINGS.map((setting) => (
              <div
                key={setting.label}
                className="flex flex-col gap-1 rounded-lg border border-border bg-background p-4"
              >
                <dt className="text-label text-muted-foreground">{setting.label}</dt>
                <dd className="text-heading font-bold text-foreground">{setting.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>
    </PageContainer>
  );
}
