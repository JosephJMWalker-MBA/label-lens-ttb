# E1b limitations

- **Phase 2 was never run.** No brand-present treatment arm exists. Four of the
  nine kill criteria are therefore *unevaluated*, not *passed*. Nothing in this
  round says anything about whether E1b would have improved brand accuracy — only
  that it is unsafe on brand-absent labels.
- **Simulation, not implementation.** Generated spans reach production through
  synthetic single-span passes, so their `passId` differs and their `assembly` is
  recorded as `whole-line`. Neither field participates in filtering, scoring,
  ranking or authority. Same construction as E1a.
- **`maxProminence` is my faithful analogue, not a production call.** Production
  computes it inside `buildBrandObservation` over the candidates it is about to
  rank; the simulation computes it per pass over that pass's kept candidates.
  Where zero candidates exist, production never computes a floor at all — so the
  `maxProminence = 0` case is a situation the production expression has no
  defined behaviour for, and the simulation's choice (floor = buffer) is the most
  permissive reading. A stricter reading (treat undefined as ineligible) would
  have changed the Phase 1 result, and that alternative is itself a new rule the
  brief forbade. This is stated plainly rather than resolved in the treatment's
  favour.
- **The prominence distribution labels are heuristic.** "Producer/bottler prose"
  and "designation/appellation text" are regex tags applied for grouping, not
  production classifications. n = 7 and n = 20 respectively — small.
- **"Lines producing E1a regressions" is matched by value containment**, so a
  line is tagged if it contains a string that became a regression selection under
  E1a. It is an association, not proof that this specific line produced it.
- **Latency unmeasured.** Candidate volume is the only proxy, as in E1a.
- **10 brand-absent cases.** "8 of 10" is a severe and unambiguous direction on a
  small denominator; the precise rate is not established.
