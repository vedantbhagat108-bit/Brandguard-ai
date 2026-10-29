import type { Channel, Review } from "@/lib/types";

export function createSeedReviews(): Review[] {
  return [];
}

export type DemoSample = {
  id: string;
  title: string;
  channel: Channel;
  isPaidPartnership: boolean;
  content: string;
  badge: string;
  description: string;
};

export const DEMO_SAMPLES: DemoSample[] = [];
