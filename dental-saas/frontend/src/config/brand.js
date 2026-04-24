/**
 * brand.js — OrthoNoe Brand SSOT (Single Source of Truth)
 *
 * ALL user-facing brand strings MUST be imported from this file.
 * ❌ NEVER hardcode "OrthoNoe" or any brand name in components.
 * ✅ ALWAYS use: import { BRAND } from "@/config/brand";
 */
export const BRAND = {
  name: "OrthoNoe",
  shortName: "OrthoNoe",
  domain: "orthonoe.com",
  supportEmail: "support@orthonoe.com",
  copyright: `© ${new Date().getFullYear()} OrthoNoe Platform Inc. All rights reserved.`,

  meta: {
    title: "OrthoNoe | The Modern Operating System for Orthodontics",
    description:
      "OrthoNoe helps orthodontic clinics manage patients, workflows, imaging, and analytics in one unified platform.",
  },

  platform: {
    name: "OrthoNoe Platform",
    tagline: "Real-time health of the OrthoNoe ecosystem.",
    headline: "Oversee and Manage the Global OrthoNoe Infrastructure",
  },

  portal: {
    copyright: "OrthoNoe Systems",
    tagline: "Clinical Precision and Digital Innovation.",
  },
};
