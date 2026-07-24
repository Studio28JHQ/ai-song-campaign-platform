"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCampaignSettings } from "../hooks/useCampaignSettings";
import { CampaignSettingsError, updateGtmContainerId } from "../services/campaignSettings";

/**
 * Feature 1 — Google Tag Manager Configuration. The only place the
 * campaign's GTM container id can be set — persisted on the Campaign
 * row, never an environment variable or a hardcoded id. An empty value
 * disables GTM entirely: no tracking code renders on the Landing.
 */
export function GtmSettingsForm() {
  const { settings, isLoading, errorMessage } = useCampaignSettings();
  const [gtmContainerId, setGtmContainerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setGtmContainerId(settings.gtmContainerId ?? "");
    }
  }, [settings]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setNotification(null);

    try {
      const trimmed = gtmContainerId.trim();
      const result = await updateGtmContainerId(trimmed.length > 0 ? trimmed : null);
      setGtmContainerId(result.gtmContainerId ?? "");
      setNotification({
        ok: true,
        message: result.gtmContainerId
          ? "Google Tag Manager está activo en la Landing."
          : "Google Tag Manager está desactivado.",
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
        <h2 className="text-sm font-medium text-foreground">Google Tag Manager</h2>
        <p className="text-caption text-muted-foreground">
          Toda integración de analítica externa se gestiona exclusivamente desde GTM. Si el campo
          está vacío, no se renderiza ningún código de seguimiento en la Landing.
        </p>
      </div>

      {isLoading ? <p className="text-body text-muted-foreground">Cargando...</p> : null}

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {!isLoading && !errorMessage ? (
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="gtm-container-id">GTM Container ID</Label>
            <Input
              id="gtm-container-id"
              placeholder="GTM-XXXXXXX"
              value={gtmContainerId}
              onChange={(event) => setGtmContainerId(event.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar"}
          </Button>
        </form>
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
