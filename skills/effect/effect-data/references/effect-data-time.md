# Duration and DateTime

Checked against `effect 4.0.0`. Read `node_modules/effect/src/Duration.ts` and `DateTime.ts` when a newer version is installed.

## Duration

| Need | Use |
| --- | --- |
| Build | `Duration.millis(n)`, `seconds`, `minutes`, `hours`, `days`, `weeks`, `nanos(bigint)`, `micros(bigint)`, `Duration.zero`, `Duration.infinity` |
| Accept from a caller | type the parameter as `Duration.Input` |
| Normalize an input | `Duration.fromInputUnsafe(input)` (throws on a bad string), `Duration.fromInput(input)` (returns `Option`) |
| Read | `Duration.toMillis`, `toSeconds`, `toMinutes`, `toHours`, `toDays`, `toNanos` (returns `Option`, `None` for infinity) |
| Arithmetic | `Duration.sum`, `subtract`, `times`, `divide` (returns `Option`), `negate`, `abs`, `min`, `max`, `clamp` |
| Compare | `Duration.isLessThan`, `isGreaterThan`, `between`, `equals`, `Duration.Order` |
| Show | `Duration.format(d)` gives `"1d 1h 1m 1s 1ms"`; `Duration.parts(d)` gives the fields |

`Duration.Input` accepts:

- a `Duration`,
- a `number` of milliseconds (`Infinity` is `Duration.infinity`),
- a `bigint` of nanoseconds,
- a string `"<number> <unit>"`, with units `nanos`, `micros`, `millis`, `seconds`, `minutes`, `hours`, `days`, `weeks` (singular forms work too), and a decimal number such as `"1.5 seconds"`,
- an object such as `{ minutes: 1, seconds: 30 }`.

A `Duration` can be negative in Effect 4: `DateTime.distance(later, earlier)` and `Duration.subtract(1s, 3s)` give negative values. Check with `Duration.isNegative` before you use one as a delay.

## DateTime

A `DateTime` is either `Utc` (an instant) or `Zoned` (an instant plus a `TimeZone`, named like `"Europe/Paris"` or a fixed offset). Both are immutable; every operation returns a new value. Two values for the same instant are equal under `DateTime.Equivalence`, whatever their zones.

### Create

| From | Safe (returns `Option`) | Throws `IllegalArgumentError` |
| --- | --- | --- |
| `Date`, epoch millis, ISO string, `{ year, month, day, hour, ... }` | `DateTime.make(input)` | `DateTime.makeUnsafe(input)` |
| The same, with a zone | `DateTime.makeZoned(input, { timeZone, adjustForTimeZone })` | `DateTime.makeZonedUnsafe(...)` |
| `"2025-01-01T03:00:00.000+01:00[Europe/Rome]"` | `DateTime.makeZonedFromString(text)` | |
| A JS `Date` | | `DateTime.fromDateUnsafe(date)` |
| Now, from the `Clock` | `yield* DateTime.now` (`Utc`), `yield* DateTime.nowInCurrentZone` (`Zoned`) | |
| Now, from the system clock | `DateTime.nowUnsafe()` | |

- A string without an offset, such as `"2025-01-01 04:00"`, is read as UTC, whatever the zone of the machine. Send ISO strings with `Z` or an offset, and use `makeZoned(..., { timeZone, adjustForTimeZone: true })` for wall-clock input.
- Part objects use singular names and 1-based months: `{ year: 2025, month: 3, day: 30, hour: 9 }`.
- In `makeZoned`, the parts are read as UTC unless `adjustForTimeZone: true`. With it, `{ hour: 9 }` in `Europe/London` is 09:00 London time.

### Zones

```ts
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

export const meetingLabel = Effect.gen(function*() {
  const now = yield* DateTime.now
  const inParis = DateTime.setZoneNamedUnsafe(now, "Europe/Paris") // throws on an unknown zone
  const inUserZone: Option.Option<DateTime.Zoned> = DateTime.setZoneNamed(now, "Mars/Base") // None
  const local = yield* DateTime.nowInCurrentZone // needs DateTime.CurrentTimeZone
  return { paris: DateTime.formatIsoZoned(inParis), user: Option.isSome(inUserZone), local: DateTime.formatIsoOffset(local) }
}).pipe(DateTime.withCurrentZoneNamed("Asia/Tokyo"))
```

- Provide the current zone with `DateTime.withCurrentZoneNamed(id)`, `withCurrentZoneOffset(ms)`, `withCurrentZoneLocal`, or the layers `DateTime.layerCurrentZoneNamed(id)` (fails with `IllegalArgumentError` on an unknown zone), `layerCurrentZoneOffset`, `layerCurrentZoneLocal`, `layerCurrentZone(zone)`.
- Build zones with `DateTime.zoneMakeNamed` (returns `Option`), `zoneMakeNamedUnsafe`, `zoneMakeNamedEffect`, `zoneMakeOffset(ms)`, `zoneMakeLocal()`, `zoneFromString`.
- `setZone`, `setZoneNamed`, `setZoneOffset` and `setZoneCurrent` keep the instant and change the zone.

### Calculate and compare

- `DateTime.add(dt, { days: 1, hours: 2 })` and `subtract` take plural unit names. Month arithmetic clamps to the last day: 31 January plus one month is 28 February.
- `addDuration` and `subtractDuration` take a `Duration.Input`.
- `startOf(dt, "day" | "week" | "month" | "year" | ...)`, `endOf`, `nearest` work in the zone of a `Zoned` value.
- `distance(a, b)` returns a signed `Duration` (`b - a`).
- `isLessThan`, `isGreaterThan`, `between`, `min`, `max`, `DateTime.Order`.
- `isFuture` and `isPast` read the `Clock` and return an `Effect`; `isFutureUnsafe` and `isPastUnsafe` read the system clock.
- `toParts` and `getPart(dt, "hour")` give wall-clock parts for a `Zoned` value; `toPartsUtc` and `getPartUtc` give UTC parts.

### Format and convert

| Need | Use | Example output |
| --- | --- | --- |
| UTC ISO for APIs and storage | `formatIso` | `2025-01-02T00:00:00.000Z` |
| Offset ISO | `formatIsoOffset` | `2025-01-01T19:00:00.000-05:00` |
| Offset ISO with zone id | `formatIsoZoned` | `2025-01-01T19:00:00.000-05:00[America/New_York]` |
| Date only | `formatIsoDate` (in the zone), `formatIsoDateUtc` | `2025-01-01` |
| Human text | `format(dt, { locale, dateStyle, timeStyle })`, `formatIntl(dt, intlFormat)`, `formatUtc`, `formatLocal` | `Wednesday, 1 January 2025 at 19:00` |
| JS `Date` of the instant | `toDateUtc` | |
| Epoch | `toEpochMillis`, `toEpochSeconds` | |

`DateTime.toDate` on a `Zoned` value returns a `Date` shifted by the zone offset, so its `toISOString()` shows wall-clock time with a `Z`. Use `toDateUtc` when the `Date` must hold the real instant.

### At the boundary

Decode with Schema rather than `DateTime.make`, so a bad value becomes a typed decode error: `Schema.DateTimeUtcFromString` for ISO strings, `Schema.DateTimeUtcFromMillis` for epoch milliseconds, `Schema.DateTimeUtcFromDate` for `Date` values. `Schema.DateTimeUtc` is the field type; its JSON codec reads and writes UTC ISO strings. See the `effect-schema` skill.
