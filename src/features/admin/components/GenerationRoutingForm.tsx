"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCampaignSettings } from "../hooks/useCampaignSettings";
import { CampaignSettingsError, updateGenerationRouting } from "../services/campaignSettings";

const NO_FALLBACK = "none";

/**
 * The providers offered in the form. The server re-validates every value
 * (`UpdateGenerationRoutingUseCase`), so this list is a convenience for the
 * operator, never the enforcement.
 */
const PROVIDER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "mureka", label: "Mureka (mureka-9)" },
  { value: "lyria", label: "Lyria (lyria-3.5)" },
];

function providerLabel(value: string | null): string {
  if (value === null) return "Desactivado";
  return PROVIDER_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/**
 * Sets which provider generates new songs, and which one covers a
 * whitelisted pre-generation failure. Persisted on the Campaign row — the
 * same DB-backed global-settings mechanism the GTM container id uses — so a
 * change applies to the next song with no redeploy and no restart.
 *
 * Two things this screen deliberately makes explicit, because they are easy
 * to assume wrongly: a change never affects a song that has already been
 * submitted (each song keeps the provider that generated it), and the
 * fallback is not a general retry — it only covers the narrow set of
 * failures where the primary provably generated nothing.
 */
export function GenerationRoutingForm() {
  const { settings, isLoading, errorMessage } = useCampaignSettings();
  const [primaryProvider, setPrimaryProvider] = useState("mureka");
  const [fallbackProvider, setFallbackProvider] = useState<string>("lyria");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ ok: boolean; message: string } | null>(null);
  const [active, setActive] = useState<{ primary: string; fallback: string | null } | null>(null);

  useEffect(() => {
    if (settings) {
      setPrimaryProvider(settings.primaryProvider);
      setFallbackProvider(settings.fallbackProvider ?? NO_FALLBACK);
      setActive({ primary: settings.primaryProvider, fallback: settings.fallbackProvider });
    }
  }, [settings]);

  const isSameProvider = fallbackProvider !== NO_FALLBACK && fallbackProvider === primaryProvider;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setNotification(null);

    try {
      const result = await updateGenerationRouting({
        primaryProvider,
        fallbackProvider: fallbackProvider === NO_FALLBACK ? null : fallbackProvider,
      });
      setPrimaryProvider(result.primaryProvider);
      setFallbackProvider(result.fallbackProvider ?? NO_FALLBACK);
      setActive({ primary: result.primaryProvider, fallback: result.fallbackProvider });
      setNotification({
        ok: true,
        message: `Guardado. Las próximas canciones se generarán con ${providerLabel(
          result.primaryProvider,
        )}.`,
      });
    } catch (error) {
      setNotification({
        ok: false,
        message: error instanceof CampaignSettingsError ? error.message : "Algo salió mal.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">Proveedores de generación</h2>
        <p className="text-caption text-muted-foreground">
          El proveedor principal genera cada canción nueva. El de respaldo solo se usa cuando el
          principal rechaza la solicitud antes de generar nada (por ejemplo, saldo agotado), nunca
          ante un error ambiguo como un timeout. Una canción ya enviada conserva su proveedor aunque
          cambies esta configuración.
        </p>
      </div>

      {isLoading ? <p className="text-body text-muted-foreground">Cargando...</p> : null}

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {active ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-md border border-border p-3">
            <dt className="text-label text-muted-foreground">Principal activo</dt>
            <dd className="text-sm font-bold text-foreground">{providerLabel(active.primary)}</dd>
          </div>
          <div className="flex flex-col gap-1 rounded-md border border-border p-3">
            <dt className="text-label text-muted-foreground">Respaldo activo</dt>
            <dd className="text-sm font-bold text-foreground">{providerLabel(active.fallback)}</dd>
          </div>
        </dl>
      ) : null}

      {!isLoading && !errorMessage ? (
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="primary-provider">Proveedor principal</Label>
            <select
              id="primary-provider"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm"
              value={primaryProvider}
              onChange={(event) => setPrimaryProvider(event.target.value)}
              disabled={isSubmitting}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="fallback-provider">Proveedor de respaldo</Label>
            <select
              id="fallback-provider"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm"
              value={fallbackProvider}
              onChange={(event) => setFallbackProvider(event.target.value)}
              disabled={isSubmitting}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value={NO_FALLBACK}>Sin respaldo</option>
            </select>
          </div>

          <Button type="submit" size="sm" disabled={isSubmitting || isSameProvider}>
            {isSubmitting ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      ) : null}

      {isSameProvider ? (
        <p role="alert" className="text-sm text-destructive">
          El proveedor de respaldo debe ser distinto del principal.
        </p>
      ) : null}

      {notification ? (
        <p
          role={notification.ok ? "status" : "alert"}
          className={notification.ok ? "text-sm text-foreground" : "text-sm text-destructive"}
        >
          {notification.message}
        </p>
      ) : null}
    </div>
  );
}
