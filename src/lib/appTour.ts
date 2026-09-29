import { useEffect } from "react";
import { driver, type DriveStep } from "driver.js";
import i18n from "@/lib/i18n";
import { TOUR_STEPS } from "@/lib/tours";

interface TourStepText {
  title: string;
  desc: string;
}

function clickTarget(dataTourId: string) {
  (
    document.querySelector(`[data-tour="${dataTourId}"]`) as HTMLElement | null
  )?.click();
}

// Tabbed content unmounts the old tab via an exit animation
// before the new one mounts, so a shorter delay would highlight nothing.
const TAB_SWITCH_DELAY = 250;

/**
 * Starts the driver.js tour. `clickFirst` clicks run from onNextClick/onPrevClick because
 * driver.js's waitForElement polls before any step hook, so a revealing click would deadlock.
 * Steps with no visible target and no `clickFirst` button (e.g. admin-only tabs) are dropped.
 */
export function startAppTour(key: string): boolean {
  const stepConfigs = TOUR_STEPS[key];
  if (!stepConfigs) return false;

  const stepText = i18n.t(`guide.tours.${key}`, {
    returnObjects: true,
  }) as TourStepText[];

  const included = stepConfigs
    .map((cfg, i) => ({ ...cfg, text: stepText[i] }))
    .filter(({ selector, clickFirst }) => {
      if (document.querySelector(`[data-tour="${selector}"]`)) return true;
      return (
        !!clickFirst && !!document.querySelector(`[data-tour="${clickFirst}"]`)
      );
    });

  if (included.length === 0) return false;

  const steps: DriveStep[] = included.map(
    ({ selector, clickFirst, side, text }) => ({
      element: `[data-tour="${selector}"]`,
      data: { clickFirst },
      popover: {
        title: text?.title ?? "",
        description: text?.desc ?? "",
        side,
      },
    }),
  );

  const tour = driver({
    showProgress: true,
    overlayOpacity: 0.65,
    skipMissingElement: true,
    nextBtnText: i18n.t("guide.tour.next"),
    prevBtnText: i18n.t("guide.tour.prev"),
    doneBtnText: i18n.t("guide.tour.done"),
    steps,
    onNextClick: () => {
      const nextIndex = (tour.getActiveIndex() ?? 0) + 1;
      const clickFirst = steps[nextIndex]?.data?.clickFirst as
        string | undefined;
      if (!clickFirst) {
        tour.moveNext();
        return;
      }
      clickTarget(clickFirst);
      setTimeout(() => tour.moveNext(), TAB_SWITCH_DELAY);
    },
    onPrevClick: () => {
      const prevIndex = (tour.getActiveIndex() ?? 0) - 1;
      const clickFirst = steps[prevIndex]?.data?.clickFirst as
        string | undefined;
      if (!clickFirst) {
        tour.movePrevious();
        return;
      }
      clickTarget(clickFirst);
      setTimeout(() => tour.movePrevious(), TAB_SWITCH_DELAY);
    },
  });

  // The first step may need its tab opened before anything is highlighted.
  const firstClickFirst = steps[0]?.data?.clickFirst as string | undefined;
  if (firstClickFirst) clickTarget(firstClickFirst);
  setTimeout(() => tour.drive(), firstClickFirst ? TAB_SWITCH_DELAY : 0);

  return true;
}

/**
 * Runs a page's tour the first time a user opens it in this browser; the
 * Guide page replays it any time. Automated browsers (navigator.webdriver)
 * are left alone so the overlay never blocks e2e runs.
 */
export function useFirstVisitTour(key: string | undefined, userId: string | undefined) {
  useEffect(() => {
    if (!key || !userId || !TOUR_STEPS[key] || navigator.webdriver) return;
    const flag = `stockdesk.tour.${userId}.${key}`;
    try {
      if (localStorage.getItem(flag)) return;
    } catch {
      return;
    }
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    // Lazy pages and their data arrive late; retry until the targets exist.
    const attempt = () => {
      if (startAppTour(key)) {
        try {
          localStorage.setItem(flag, "1");
        } catch {
          /* storage blocked: the tour just shows again next time */
        }
      } else if (Date.now() - started < 8000) {
        timer = setTimeout(attempt, 300);
      }
    };
    timer = setTimeout(attempt, 800);
    return () => clearTimeout(timer);
  }, [key, userId]);
}
