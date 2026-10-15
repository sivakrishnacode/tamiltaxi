import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page";
import { adminApi } from "@/lib/api";
import { param } from "@/lib/paging";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const [settings, sp] = await Promise.all([adminApi.settings(), searchParams]);
  return (
    <>
      <PageHeader title="Settings" description="Platform-wide values used by fares, dispatch, plans and the apps. Changes apply within ~15 seconds." />
      <SettingsForm initial={settings} section={param(sp.section)} />
    </>
  );
}
