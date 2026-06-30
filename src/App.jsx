import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  CalendarDays,
  Clock
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ToggleGroup,
  ToggleGroupItem
} from "@/components/ui/toggle-group";

const BASE_URL =
  "https://clairemont-window-timelapse.s3.us-east-1.amazonaws.com/";

// First captured image: 2026-06-07 at 13:00. Images exist hourly after that.
const START_YEAR = 2026;
const START_MONTH = 6; // June (1-based)
const START_DAY = 7;
const START_HOUR = 13;

const pad = (n) => String(n).padStart(2, "0");

const imageUrl = ({ y, m, d }, hour) =>
  `${BASE_URL}${y}-${pad(m)}-${pad(d)}-${pad(hour)}-00.jpg`;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

const formatDay = ({ y, m, d }) => {
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[m - 1]} ${d}`;
};

const formatDayShort = ({ m, d }) => `${MONTHS[m - 1]} ${d}`;

const formatHour = (hour) => {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${period}`;
};

// Every day from the first capture through today. Each day carries the range
// of hours that actually have images: the first day starts at START_HOUR, and
// today only goes up to the most recent hour.
const buildAllDays = () => {
  const start = new Date(START_YEAR, START_MONTH - 1, START_DAY);
  const now = new Date();

  const days = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0); // noon avoids DST edge cases when stepping

  while (cursor <= now) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const d = cursor.getDate();

    const isFirst = y === START_YEAR && m === START_MONTH && d === START_DAY;
    const isToday =
      y === now.getFullYear() &&
      m === now.getMonth() + 1 &&
      d === now.getDate();

    days.push({
      y,
      m,
      d,
      minHour: isFirst ? START_HOUR : 0,
      maxHour: isToday ? now.getHours() : 23
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};

const isValidFrame = (day, hour) =>
  !!day && hour >= day.minHour && hour <= day.maxHour;

// Hours that have an image for a given day.
const hoursForDay = (day) => {
  const out = [];
  if (!day) return out;
  for (let h = day.minHour; h <= day.maxHour; h++) out.push(h);
  return out;
};

// Indices (into allDays) of the days that have an image at a given hour.
const dayIdxsForHour = (allDays, hour) => {
  const out = [];
  allDays.forEach((day, i) => {
    if (hour >= day.minHour && hour <= day.maxHour) out.push(i);
  });
  return out;
};

// Nearest day index to `from` whose image range includes `hour`.
const nearestValidDay = (allDays, from, hour) => {
  for (let off = 0; off < allDays.length; off++) {
    const lo = from - off;
    const hi = from + off;
    if (lo >= 0 && isValidFrame(allDays[lo], hour)) return lo;
    if (hi < allDays.length && isValidFrame(allDays[hi], hour)) return hi;
  }
  return from;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const SPEEDS = [
  { label: "0.5×", ms: 1600 },
  { label: "1×", ms: 800 },
  { label: "2×", ms: 400 },
  { label: "4×", ms: 200 }
];

function App() {
  const allDays = useMemo(buildAllDays, []);
  const lastDayIdx = allDays.length - 1;

  // "days": fix the hour, scrub across days. "hours": fix the day, scrub hours.
  const [mode, setMode] = useState("days");

  // Single source of truth for the displayed frame.
  const [curDayIdx, setCurDayIdx] = useState(lastDayIdx);
  const [curHour, setCurHour] = useState(START_HOUR);

  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const safeDayIdx = clamp(curDayIdx, 0, lastDayIdx);
  const curDay = allDays[safeDayIdx];
  const currentUrl = curDay ? imageUrl(curDay, curHour) : null;

  // The list the scrubber/playback moves through, depending on mode.
  const activeDayIdxs = useMemo(
    () => dayIdxsForHour(allDays, curHour),
    [allDays, curHour]
  );
  const activeHours = useMemo(() => hoursForDay(curDay), [curDay]);

  const isDays = mode === "days";
  const scrubLen = isDays ? activeDayIdxs.length : activeHours.length;
  const scrubPos = isDays
    ? Math.max(0, activeDayIdxs.indexOf(safeDayIdx))
    : Math.max(0, activeHours.indexOf(curHour));

  // Reset load state when the displayed image changes.
  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [currentUrl]);

  // Preload the frames for the current axis so playback is smooth.
  useEffect(() => {
    const urls = isDays
      ? activeDayIdxs.map((i) => imageUrl(allDays[i], curHour))
      : activeHours.map((h) => imageUrl(curDay, h));
    const imgs = urls.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    return () => imgs.forEach((img) => (img.src = ""));
  }, [isDays, activeDayIdxs, activeHours, allDays, curDay, curHour]);

  const goToPos = useCallback(
    (pos) => {
      if (isDays) {
        const i = activeDayIdxs[pos];
        if (i != null) setCurDayIdx(i);
      } else {
        const h = activeHours[pos];
        if (h != null) setCurHour(h);
      }
    },
    [isDays, activeDayIdxs, activeHours]
  );

  // Playback timer — advances one frame along the active axis, looping.
  useEffect(() => {
    if (!playing || scrubLen < 2) return undefined;
    const id = setInterval(() => {
      if (isDays) {
        setCurDayIdx((prev) => {
          const pos = activeDayIdxs.indexOf(clamp(prev, 0, lastDayIdx));
          return activeDayIdxs[(pos + 1) % activeDayIdxs.length];
        });
      } else {
        setCurHour((prev) => {
          const pos = activeHours.indexOf(prev);
          return activeHours[(pos + 1) % activeHours.length];
        });
      }
    }, SPEEDS[speedIdx].ms);
    return () => clearInterval(id);
  }, [
    playing,
    speedIdx,
    scrubLen,
    isDays,
    activeDayIdxs,
    activeHours,
    lastDayIdx
  ]);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  const step = useCallback(
    (delta) => {
      setPlaying(false);
      goToPos(clamp(scrubPos + delta, 0, scrubLen - 1));
    },
    [goToPos, scrubPos, scrubLen]
  );

  // Picker: choose the hour (days mode). Keep the current day valid for it.
  const pickHour = useCallback(
    (h) => {
      setPlaying(false);
      setCurHour(h);
      setCurDayIdx((prev) => {
        const i = clamp(prev, 0, lastDayIdx);
        return isValidFrame(allDays[i], h) ? i : nearestValidDay(allDays, i, h);
      });
    },
    [allDays, lastDayIdx]
  );

  // Picker: choose the day (hours mode). Keep the current hour valid for it.
  const pickDay = useCallback(
    (i) => {
      setPlaying(false);
      setCurDayIdx(i);
      const day = allDays[i];
      setCurHour((prev) => clamp(prev, day.minHour, day.maxHour));
    },
    [allDays]
  );

  const switchMode = useCallback((m) => {
    if (!m) return;
    setPlaying(false);
    setMode(m);
  }, []);

  // Keyboard shortcuts. Left/right step the active axis; up/down nudge the
  // other (picker) axis.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        step(1);
      } else if (e.key === "ArrowLeft") {
        step(-1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (isDays) pickHour(clamp(curHour + 1, 0, 23));
        else pickDay(clamp(safeDayIdx + 1, 0, lastDayIdx));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (isDays) pickHour(clamp(curHour - 1, 0, 23));
        else pickDay(clamp(safeDayIdx - 1, 0, lastDayIdx));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    togglePlay,
    step,
    isDays,
    pickHour,
    pickDay,
    curHour,
    safeDayIdx,
    lastDayIdx
  ]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Image stage */}
      <main className="relative flex min-h-0 flex-1 items-center justify-center bg-black/60">
        {currentUrl && (
          <img
            key={currentUrl}
            src={currentUrl}
            alt={curDay ? formatDay(curDay) : ""}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            draggable={false}
            className={`max-h-full max-w-full object-contain transition-opacity duration-150 ${
              loaded && !errored ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {errored && (
          <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
            <ImageOff className="size-6" />
            No image for this time
          </div>
        )}
        {!loaded && !errored && currentUrl && (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
            Loading…
          </div>
        )}
      </main>

      {/* Controls */}
      <footer className="border-t bg-card px-5 py-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {/* Current date & time + mode toggle */}
          <div className="flex items-center justify-between gap-4">
            {curDay && (
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold tracking-tight">
                  {formatDay(curDay)}, {curDay.y}
                </span>
                <span className="text-muted-foreground text-sm">
                  · {formatHour(curHour)}
                </span>
              </div>
            )}

            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={switchMode}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="days" className="gap-1.5 px-3 text-xs">
                <CalendarDays className="size-3.5" />
                Across days
              </ToggleGroupItem>
              <ToggleGroupItem value="hours" className="gap-1.5 px-3 text-xs">
                <Clock className="size-3.5" />
                Within a day
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Transport + main scrubber (active axis) */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => step(-1)}
              disabled={scrubPos <= 0}
              aria-label={isDays ? "Previous day" : "Previous hour"}
            >
              <ChevronLeft className="size-5" />
            </Button>
            <Button
              size="icon"
              onClick={togglePlay}
              disabled={scrubLen < 2}
              aria-label={playing ? "Pause" : "Play"}
              className="size-11 rounded-full"
            >
              {playing ? (
                <Pause className="size-5 fill-current" />
              ) : (
                <Play className="size-5 fill-current" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => step(1)}
              disabled={scrubPos >= scrubLen - 1}
              aria-label={isDays ? "Next day" : "Next hour"}
            >
              <ChevronRight className="size-5" />
            </Button>

            <Slider
              value={[scrubPos]}
              min={0}
              max={Math.max(0, scrubLen - 1)}
              step={1}
              onValueChange={([v]) => {
                setPlaying(false);
                goToPos(v);
              }}
              className="flex-1"
            />
            <span className="text-muted-foreground w-20 text-right text-sm tabular-nums">
              {scrubLen ? scrubPos + 1 : 0} / {scrubLen}
            </span>
          </div>

          {/* Picker (the fixed axis) + speed */}
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground w-14 text-xs font-medium tracking-wide uppercase">
              {isDays ? "Time" : "Day"}
            </span>
            {isDays ? (
              <Slider
                value={[curHour]}
                min={0}
                max={23}
                step={1}
                onValueChange={([v]) => pickHour(v)}
                className="flex-1"
              />
            ) : (
              <Slider
                value={[safeDayIdx]}
                min={0}
                max={lastDayIdx}
                step={1}
                onValueChange={([v]) => pickDay(v)}
                className="flex-1"
              />
            )}
            <span className="w-20 text-sm font-semibold tabular-nums">
              {isDays
                ? formatHour(curHour)
                : curDay
                  ? formatDayShort(curDay)
                  : ""}
            </span>

            <ToggleGroup
              type="single"
              value={String(speedIdx)}
              onValueChange={(v) => {
                if (v !== "") setSpeedIdx(Number(v));
              }}
              variant="outline"
              size="sm"
            >
              {SPEEDS.map((s, i) => (
                <ToggleGroupItem
                  key={s.label}
                  value={String(i)}
                  aria-label={`Speed ${s.label}`}
                  className="px-3 text-xs"
                >
                  {s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
