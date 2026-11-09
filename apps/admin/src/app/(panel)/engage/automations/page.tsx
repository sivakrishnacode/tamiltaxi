import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page";
import { ApiError, adminApi } from "@/lib/api";
import { readReminderSettings } from "@/lib/automations";
import { readWelcomeSettings } from "@/lib/whatsapp";

import { AutomationsForm } from "./automations-form";

export const metadata: Metadata = { title: "Automations" };

/** null when this API doesn't have the endpoint yet (404); other API errors still show the error page. */
function orNull<T>(p: Promise<T>): Promise<T | null> {
  return p.catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
}

export default async function AutomationsPage() {
  const [settings, overview, welcome, messages] = await Promise.all([
    adminApi.settings(),
    orNull(adminApi.automations()),
    orNull(adminApi.welcomeMessages()),
    orNull(adminApi.reminderMessages()),
  ]);
  const reminders = readReminderSettings(settings);
  const welcomes = readWelcomeSettings(settings);

  return (
    <>
      <PageHeader title="Automations" description="Messages that send themselves once switched on. Each card shows when it fires, what it sends and how it does." />
      <AutomationsForm
        initial={{ ...reminders.values, ...welcomes.values }}
        isSupported={{ reminders: reminders.isSupported, welcome: welcomes.isSupported }}
        reminders={overview ? { search: overview.search, routine: overview.routine } : null}
        welcome={welcome}
        messages={messages}
      />
    </>
  );
}
