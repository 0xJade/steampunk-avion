/** @jsxImportSource preact */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DayAvailability, ISODate } from '@lib/availability/types';
import {
  todayISO,
  startOfMonthISO,
  daysInMonth,
  weekdayUTC,
  addDaysISO,
  daysBetween,
  isPast,
  nextSelection,
  validateRange,
  type DateRange,
} from '@lib/dates';

interface Props {
  airbnbUrl: string;
  monthsForward: number;
  defaultMinNights: number;
  defaultAdults: number;
}

interface ApiResponse {
  from: ISODate;
  to: ISODate;
  hasPricing: boolean;
  days: DayAvailability[];
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthLabel(monthStart: ISODate): string {
  const [y, m] = monthStart.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function bookingUrl(base: string, range: DateRange, adults: number): string {
  const u = new URL(base);
  if (range.checkIn) u.searchParams.set('check_in', range.checkIn);
  if (range.checkOut) u.searchParams.set('check_out', range.checkOut);
  u.searchParams.set('adults', String(adults));
  return u.toString();
}

type CellState = 'past' | 'blocked' | 'available' | 'selected-in' | 'selected-out' | 'in-range';

export default function Availability({
  airbnbUrl,
  monthsForward,
  defaultMinNights,
  defaultAdults,
}: Props) {
  const today = useMemo(() => todayISO(), []);
  const firstMonth = useMemo(() => startOfMonthISO(today), [today]);

  const [offset, setOffset] = useState(0);
  const [byDate, setByDate] = useState<Map<ISODate, DayAvailability>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasPricing, setHasPricing] = useState(false);
  const [range, setRange] = useState<DateRange>({ checkIn: null, checkOut: null });
  const [hover, setHover] = useState<ISODate | null>(null);

  // Last month a guest may browse to (as a first visible panel).
  const maxOffset = monthsForward - 1;

  useEffect(() => {
    const from = today;
    const lastStart = startOfMonthISO(today, monthsForward);
    const to = addDaysISO(lastStart, daysInMonth(lastStart) - 1);
    const controller = new AbortController();

    fetch(`/api/availability?from=${from}&to=${to}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: ApiResponse) => {
        const map = new Map<ISODate, DayAvailability>();
        for (const d of data.days) map.set(d.date, d);
        setByDate(map);
        setHasPricing(Boolean(data.hasPricing));
        setStatus('ready');
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setStatus('error');
      });

    return () => controller.abort();
  }, [today, monthsForward]);

  const validation = useMemo(
    () => validateRange(range, byDate, { defaultMinNights, today }),
    [range, byDate, defaultMinNights, today],
  );

  function cellState(date: ISODate): CellState {
    if (date === range.checkIn) return 'selected-in';
    if (date === range.checkOut) return 'selected-out';
    if (isPast(date, today)) return 'past';
    const info = byDate.get(date);
    if (!info || !info.available) return 'blocked';

    // Preview the range between a chosen check-in and the hovered day.
    const end = range.checkOut ?? (range.checkIn && !range.checkOut ? hover : null);
    if (range.checkIn && end && daysBetween(range.checkIn, date) > 0 && daysBetween(date, end) > 0) {
      return 'in-range';
    }
    return 'available';
  }

  function onPick(date: ISODate) {
    if (isPast(date, today)) return;
    const info = byDate.get(date);
    if (!info || !info.available) return;
    setRange((cur) => nextSelection(cur, date));
  }

  const selectionValid = validation.valid;
  const href = selectionValid ? bookingUrl(airbnbUrl, range, defaultAdults) : airbnbUrl;

  return (
    <div class="mt-8">
      {status === 'error' ? (
        <FailSoft airbnbUrl={airbnbUrl} />
      ) : (
        <>
          <div class="flex items-center justify-between">
            <button
              type="button"
              class="rounded-md border border-brass/30 p-2 text-brass transition-colors duration-250 ease-soft enabled:hover:border-brass enabled:hover:text-brass-lit disabled:opacity-30"
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              disabled={offset === 0}
              aria-label="Previous month"
            >
              <Chevron dir="left" />
            </button>
            <p class="font-typewriter text-xs uppercase tracking-widest text-parchment-d" aria-live="polite">
              {status === 'loading' ? 'Loading calendar…' : 'Select check-in and checkout'}
            </p>
            <button
              type="button"
              class="rounded-md border border-brass/30 p-2 text-brass transition-colors duration-250 ease-soft enabled:hover:border-brass enabled:hover:text-brass-lit disabled:opacity-30"
              onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))}
              disabled={offset >= maxOffset}
              aria-label="Next month"
            >
              <Chevron dir="right" />
            </button>
          </div>

          <div class="mt-6 grid gap-8 md:grid-cols-2">
            <Month
              monthStart={startOfMonthISO(firstMonth, offset)}
              cellState={cellState}
              onPick={onPick}
              onHover={setHover}
              pricing={hasPricing ? byDate : null}
            />
            {/* Second month: desktop only. */}
            <div class="hidden md:block">
              {offset + 1 <= maxOffset + 1 && (
                <Month
                  monthStart={startOfMonthISO(firstMonth, offset + 1)}
                  cellState={cellState}
                  onPick={onPick}
                  onHover={setHover}
                  pricing={hasPricing ? byDate : null}
                />
              )}
            </div>
          </div>

          <Legend />

          {!hasPricing && status === 'ready' && (
            <p class="mt-4 font-typewriter text-xs text-parchment-d">
              Nightly rates are shown on Airbnb.
            </p>
          )}

          <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-sm text-parchment-d" aria-live="polite">
              {selectionValid
                ? `${range.checkIn} → ${range.checkOut} · ${validation.nights} night${validation.nights === 1 ? '' : 's'}`
                : selectionMessage(validation.reason, validation.minNights)}
            </p>
            <a
              href={href}
              target="_blank"
              rel="noopener"
              aria-disabled={!selectionValid && !!range.checkIn && !range.checkOut}
              class="inline-flex items-center justify-center gap-2 rounded-md bg-ember px-6 py-3 font-body font-semibold text-ink shadow-ember transition-colors duration-250 ease-soft hover:bg-brass-lit"
            >
              {selectionValid ? 'Book these dates on Airbnb' : 'See rates on Airbnb'}
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function selectionMessage(
  reason: ReturnType<typeof validateRange>['reason'],
  minNights: number,
): string {
  switch (reason) {
    case 'incomplete':
      return 'Pick your check-in and checkout dates.';
    case 'below-min-nights':
      return `This stay needs at least ${minNights} nights.`;
    case 'contains-blocked':
      return 'Those dates include a night that’s already booked.';
    case 'same-day':
    case 'checkout-before-checkin':
      return 'Checkout must be after check-in.';
    case 'in-past':
      return 'Choose dates in the future.';
    default:
      return 'Pick your dates.';
  }
}

interface MonthProps {
  monthStart: ISODate;
  cellState: (d: ISODate) => CellState;
  onPick: (d: ISODate) => void;
  onHover: (d: ISODate | null) => void;
  pricing: Map<ISODate, DayAvailability> | null;
}

function Month({ monthStart, cellState, onPick, onHover, pricing }: MonthProps) {
  const total = daysInMonth(monthStart);
  const lead = weekdayUTC(monthStart); // blanks before day 1
  const cells: (ISODate | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => addDaysISO(monthStart, i)),
  ];

  return (
    <div>
      <p class="mb-3 text-center font-display text-lg text-parchment">{monthLabel(monthStart)}</p>
      <div class="grid grid-cols-7 gap-1" role="grid" aria-label={monthLabel(monthStart)}>
        {WEEKDAYS.map((w) => (
          <div class="pb-1 text-center font-typewriter text-[0.65rem] uppercase text-parchment-d/70" role="columnheader">
            {w}
          </div>
        ))}
        {cells.map((date) =>
          date === null ? (
            <div aria-hidden="true" />
          ) : (
            <DayCell
              date={date}
              state={cellState(date)}
              onPick={onPick}
              onHover={onHover}
              price={pricing?.get(date)?.nightlyPrice}
            />
          ),
        )}
      </div>
    </div>
  );
}

interface DayCellProps {
  date: ISODate;
  state: CellState;
  onPick: (d: ISODate) => void;
  onHover: (d: ISODate | null) => void;
  price?: number;
}

function DayCell({ date, state, onPick, onHover, price }: DayCellProps) {
  const dayNum = Number(date.slice(8, 10));
  const disabled = state === 'past' || state === 'blocked';
  const selected = state === 'selected-in' || state === 'selected-out';

  // States are distinguished by MORE than color: booked days get a line-through
  // glyph, past days lose contrast + a dot, selected/range get fills + rings.
  const base =
    'relative flex aspect-square items-center justify-center rounded-md text-sm transition-colors duration-200 ease-soft';
  const byState: Record<CellState, string> = {
    past: 'text-parchment-d/30 line-through decoration-parchment-d/30 cursor-not-allowed',
    blocked: 'text-parchment-d/55 line-through decoration-brass/60 cursor-not-allowed',
    available: 'text-parchment hover:bg-brass/20 hover:ring-1 hover:ring-brass/50 cursor-pointer',
    'in-range': 'bg-brass/15 text-parchment cursor-pointer',
    'selected-in': 'bg-ember font-bold text-ink ring-2 ring-filament cursor-pointer',
    'selected-out': 'bg-ember font-bold text-ink ring-2 ring-filament cursor-pointer',
  };

  const aria =
    state === 'blocked'
      ? `${date}, booked`
      : state === 'past'
        ? `${date}, past`
        : state === 'selected-in'
          ? `${date}, selected check-in`
          : state === 'selected-out'
            ? `${date}, selected checkout`
            : `${date}, available${price ? `, $${price}` : ''}`;

  return (
    <button
      type="button"
      role="gridcell"
      class={`${base} ${byState[state]}`}
      disabled={disabled}
      aria-label={aria}
      aria-pressed={selected}
      onClick={() => onPick(date)}
      onMouseEnter={() => onHover(date)}
      onFocus={() => onHover(date)}
    >
      <span>{dayNum}</span>
      {price && !disabled && (
        <span class="absolute bottom-0.5 text-[0.55rem] leading-none text-brass-lit">${price}</span>
      )}
    </button>
  );
}

function Legend() {
  const items: { label: string; swatch: string; extra?: string }[] = [
    { label: 'Available', swatch: 'bg-transparent ring-1 ring-brass/40 text-parchment' },
    { label: 'Booked', swatch: 'line-through decoration-brass/60 text-parchment-d/50', extra: '12' },
    { label: 'Selected', swatch: 'bg-ember text-ink' },
  ];
  return (
    <ul class="mt-5 flex flex-wrap gap-x-6 gap-y-2">
      {items.map((it) => (
        <li class="flex items-center gap-2 text-xs text-parchment-d">
          <span class={`flex h-6 w-6 items-center justify-center rounded text-[0.6rem] ${it.swatch}`}>
            {it.extra ?? ''}
          </span>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function FailSoft({ airbnbUrl }: { airbnbUrl: string }) {
  return (
    <div class="card-bulb rounded-lg p-8 text-center">
      <p class="text-parchment">We couldn’t load the live calendar right now.</p>
      <p class="mt-1 text-sm text-parchment-d">
        You can still see open dates and book directly on Airbnb.
      </p>
      <a
        href={airbnbUrl}
        target="_blank"
        rel="noopener"
        class="mt-5 inline-block rounded-md bg-ember px-6 py-3 font-body font-semibold text-ink shadow-ember transition-colors duration-250 ease-soft hover:bg-brass-lit"
      >
        Check availability on Airbnb
      </a>
    </div>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {dir === 'left' ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}
