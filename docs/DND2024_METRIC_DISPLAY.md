# D&D 2024 metric display

The carrying-capacity rules and inventory snapshots remain in their existing canonical units. This feature converts values only at the sheet presentation boundary:

- Pounds to kilograms: multiply by the exact factor `0.45359237`.
- Feet to meters: multiply by the exact factor `0.3048`.
- Displayed weights and distances round to the nearest `0.01` of the displayed unit. For example, the five-foot movement limit is shown as approximately `1.52 m`.
- The custom-item weight field accepts kilograms and converts back to pounds before the existing inventory value is saved. No rounded display value is used in a rule calculation or persisted as a replacement for the canonical value.

Only weight and the hauling movement note in the D&D 2024 Equipment section are converted. Other rules text and unrelated distance displays are outside this presentation change.
