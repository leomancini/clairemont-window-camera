import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ImageOff
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

const formatHour = (hour) => {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${period}`;
};

// Build the list of valid days for a given hour, respecting the very first
// image (2026-06-07 13:00) and not running past the most recent capture.
const buildDays = (hour) => {
  const start = new Date(START_YEAR, START_MONTH - 1, START_DAY);
  const now = new Date();

  const days = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0); // noon avoids DST edge cases when stepping

  while (cursor <= now) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const d = cursor.getDate();

    const isFirstDay = y === START_YEAR && m === START_MONTH && d === START_DAY;
    const isToday =
      y === now.getFullYear() &&
      m === now.getMonth() + 1 &&
      d === now.getDate();

    // Skip the start day's hours before the first capture.
    const beforeStart = isFirstDay && hour < START_HOUR;
    // Skip today's hours that haven't happened yet.
    const inFuture = isToday && hour > now.getHours();

    if (!beforeStart && !inFuture) {
      days.push({ y, m, d });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};

const SPEEDS = [
  { label: "0.5×", ms: 1600 },
  { label: "1×", ms: 800 },
  { label: "2×", ms: 400 },
  { label: "4×", ms: 200 }
];

function App() {
  const [hour, setHour] = useState(START_HOUR);
  const [dayIndex, setDayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const days = useMemo(() => buildDays(hour), [hour]);

  // Keep the day index valid whenever the available days change.
  useEffect(() => {
    setDayIndex((i) => Math.min(i, Math.max(0, days.length - 1)));
  }, [days.length]);

  const safeIndex = Math.min(dayIndex, Math.max(0, days.length - 1));
  const currentDay = days[safeIndex];
  const currentUrl = currentDay ? imageUrl(currentDay, hour) : null;

  // Reset load state when the displayed image changes.
  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [currentUrl]);

  // Preload every image for the selected hour so the slideshow is smooth.
  useEffect(() => {
    const imgs = days.map((day) => {
      const img = new Image();
      img.src = imageUrl(day, hour);
      return img;
    });
    return () => imgs.forEach((img) => (img.src = ""));
  }, [days, hour]);

  // Slideshow timer.
  useEffect(() => {
    if (!playing || days.length < 2) return undefined;
    const id = setInterval(() => {
      setDayIndex((i) => (i + 1) % days.length);
    }, SPEEDS[speedIdx].ms);
    return () => clearInterval(id);
  }, [playing, speedIdx, days.length]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const stepDay = useCallback(
    (delta) => {
      setPlaying(false);
      setDayIndex((i) => {
        const next = i + delta;
        if (next < 0) return 0;
        if (next > days.length - 1) return days.length - 1;
        return next;
      });
    },
    [days.length]
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        stepDay(1);
      } else if (e.key === "ArrowLeft") {
        stepDay(-1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHour((h) => Math.min(23, h + 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHour((h) => Math.max(0, h - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, stepDay]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Image stage */}
      <main className="relative flex min-h-0 flex-1 items-center justify-center bg-black/60">
        {currentUrl && (
          <img
            key={currentUrl}
            src={currentUrl}
            alt={currentDay ? formatDay(currentDay) : ""}
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
          {/* Current date & time */}
          {currentDay && (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">
                {formatDay(currentDay)}, {currentDay.y}
              </span>
              <span className="text-muted-foreground text-sm">
                · {formatHour(hour)}
              </span>
            </div>
          )}

          {/* Day scrubber + transport */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => stepDay(-1)}
              disabled={safeIndex <= 0}
              aria-label="Previous day"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <Button
              size="icon"
              onClick={togglePlay}
              disabled={days.length < 2}
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
              onClick={() => stepDay(1)}
              disabled={safeIndex >= days.length - 1}
              aria-label="Next day"
            >
              <ChevronRight className="size-5" />
            </Button>

            <Slider
              value={[safeIndex]}
              min={0}
              max={Math.max(0, days.length - 1)}
              step={1}
              onValueChange={([v]) => {
                setPlaying(false);
                setDayIndex(v);
              }}
              className="flex-1"
            />
            <span className="text-muted-foreground w-20 text-right text-sm tabular-nums">
              {days.length ? safeIndex + 1 : 0} / {days.length}
            </span>
          </div>

          {/* Time-of-day + speed */}
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground w-20 text-xs font-medium tracking-wide uppercase">
              Time
            </span>
            <Slider
              value={[hour]}
              min={0}
              max={23}
              step={1}
              onValueChange={([v]) => {
                setPlaying(false);
                setHour(v);
              }}
              className="flex-1"
            />
            <span className="w-20 text-sm font-semibold tabular-nums">
              {formatHour(hour)}
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
