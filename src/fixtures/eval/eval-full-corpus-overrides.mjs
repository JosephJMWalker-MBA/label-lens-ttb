function brandPresent(acceptablePresentations, options = {}) {
  return {
    presence: "present",
    acceptablePresentations,
    genuinelyAmbiguous: options.genuinelyAmbiguous ?? false,
    ambiguityReason: options.ambiguityReason ?? null,
    forbiddenPresentations: options.forbiddenPresentations ?? [],
    approxGeometry: [],
    orientation: options.orientation ?? "horizontal",
  };
}

function brandAbsent(absenceReason, options = {}) {
  return {
    presence: "absent",
    acceptablePresentations: [],
    genuinelyAmbiguous: false,
    ambiguityReason: null,
    absenceReason,
    forbiddenPresentations: options.forbiddenPresentations ?? [],
    approxGeometry: [],
    orientation: "not-applicable",
  };
}

function presentAlcohol(acceptablePercents, acceptableStatements, options = {}) {
  const characteristics = new Set(options.characteristics ?? []);
  if (acceptablePercents.some((value) => !Number.isInteger(value))) {
    characteristics.add("decimal-value");
  }
  if ((options.orientation ?? "horizontal") !== "horizontal") {
    characteristics.add("rotated-or-vertical");
  }
  return {
    presence: "present",
    acceptablePercents,
    acceptableStatements,
    characteristics: [...characteristics],
    approxGeometry: [],
    orientation: options.orientation ?? "horizontal",
  };
}

function absentAlcohol(absenceReason) {
  return {
    presence: "absent",
    acceptablePercents: [],
    acceptableStatements: [],
    characteristics: [],
    absenceReason,
    approxGeometry: [],
    orientation: "not-applicable",
  };
}

function confidence(value) {
  if (typeof value === "string") {
    return { overall: value, brand: value, alcohol: value };
  }
  return {
    overall: value.overall ?? "high",
    brand: value.brand ?? value.overall ?? "high",
    alcohol: value.alcohol ?? value.overall ?? "high",
  };
}

function derivedVisualStrata(strata, brand, alcohol) {
  const visualStrata = new Set(strata);
  if (brand.genuinelyAmbiguous) {
    visualStrata.add("genuinely-ambiguous");
  }
  if (alcohol.presence === "absent") {
    visualStrata.add("missing-alcohol-statement");
  }
  return [...visualStrata];
}

function include({ strata, notes, brand, alcohol, confidence: score = "high" }) {
  return {
    status: "included",
    inspection: {
      visualStrata: derivedVisualStrata(strata, brand, alcohol),
      reviewReasons: [],
      notes,
    },
    annotation: {
      brand,
      alcohol,
      confidence: confidence(score),
      notes,
    },
  };
}

function exclude({
  reason,
  strata,
  notes = reason,
  status = "excluded_uncertain_truth",
  reviewReasons = status === "excluded_uncertain_truth" || status === "excluded_other"
    ? ["other"]
    : [],
}) {
  return {
    status,
    exclusionReason: reason,
    inspection: {
      visualStrata: strata,
      reviewReasons,
      notes,
    },
  };
}

const FRONT_SIMPLE = ["simple-centered-brand", "front-label"];
const FRONT_SCRIPT = ["decorative-or-script-brand", "front-label"];
const FRONT_COMPLEX = ["multiple-brand-like-phrases", "front-label"];
const BACK_SIMPLE = ["multi-line-brand", "back-label"];
const BACK_DENSE = ["back-label", "dense-text"];
const BACK_GENERIC = ["back-label"];
const WRAP_SIDE = [
  "decorative-or-script-brand",
  "wraparound",
  "vertical-mandatory-strip",
  "alcohol-at-side-or-rotated",
  "front-label",
];
const LOW_RES_BACK = ["back-label", "low-resolution"];
const MULTI_PANEL = ["multi-panel"];

export const FULL_CORPUS_RECORD_OVERRIDES = {
  "approved-wine-008": include({
    strata: [...FRONT_COMPLEX, "alcohol-at-bottom"],
    notes:
      "Vino Alpino export-style panel with producer text for Terre Sparse and a determinate 13% alcohol line near the upper center.",
    brand: brandPresent(["Vino Alpino"], {
      forbiddenPresentations: ["Terre Sparse", "Vino Rosso", "Red Wine"],
    }),
    alcohol: presentAlcohol([13], ["alc 13% vol", "13%"]),
  }),
  "approved-wine-009": include({
    strata: [...FRONT_COMPLEX, "alcohol-at-bottom"],
    notes:
      "Vino Alpino panel matching approved-wine-008, but with the alcohol shown as a comma-decimal 13,5% by volume.",
    brand: brandPresent(["Vino Alpino"], {
      forbiddenPresentations: ["Terre Sparse", "Vino Rosso", "Red Wine"],
    }),
    alcohol: presentAlcohol([13.5], ["13,5% by vol", "13.5%", "13,5%"]),
  }),
  "approved-wine-011": include({
    strata: [...FRONT_COMPLEX, "alcohol-at-bottom"],
    notes:
      "MariaAntonietta / Coste della Sesia label with the house name dominating and a small 13.5% vol line at the lower-right corner.",
    brand: brandPresent(["MariaAntonietta"], {
      forbiddenPresentations: ["Coste della Sesia", "Red Wine"],
    }),
    alcohol: presentAlcohol([13.5], ["13.5% vol", "13.5%"]),
  }),
  "approved-wine-013": include({
    strata: [...FRONT_SCRIPT, "multiple-brand-like-phrases", "alcohol-at-bottom"],
    notes:
      "Afflicted Reserva panel with Player's Heart used as the cuvee line and a 13.5% ABV statement above the barcode block.",
    brand: brandPresent(["Afflicted"], {
      forbiddenPresentations: ["Player's Heart", "Reserva", "Cabernet"],
    }),
    alcohol: presentAlcohol([13.5], ["13.5% ABV", "13.5%"]),
  }),
  "approved-wine-017": include({
    strata: [...FRONT_SIMPLE, "alcohol-at-bottom"],
    notes:
      "La Borde Noire back-facing export label with the wine name carried at top and a direct 12% by volume footer line.",
    brand: brandPresent(["La Borde Noire"], {
      forbiddenPresentations: ["Grenache Noir", "Syrah"],
    }),
    alcohol: presentAlcohol([12], ["ALC. 12% BY VOL.", "12%"]),
  }),
  "approved-wine-022": include({
    strata: [...BACK_GENERIC, "alcohol-at-bottom"],
    notes:
      "Pure regulatory back panel with a determinate 12% alcohol line but no distinct consumer-facing brand separate from the bottler statement.",
    brand: brandAbsent(
      "The image shows only a producer statement and generic style text, not a distinct brand presentation.",
      { forbiddenPresentations: ["Marble Creek Acres", "Concord"] },
    ),
    alcohol: presentAlcohol([12], ["12% ALC BY VOL", "12%"]),
  }),
  "approved-wine-023": include({
    strata: [...FRONT_SCRIPT, "alcohol-at-bottom"],
    notes:
      "Podere don Cataldo script header above the varietal and appellation, with a determinate 14% by volume footer line.",
    brand: brandPresent(["Podere don Cataldo", "Podere Don Cataldo"], {
      forbiddenPresentations: ["Primitivo", "Salento"],
    }),
    alcohol: presentAlcohol([14], ["ALC. 14% BY VOL.", "14%"]),
  }),
  "approved-wine-024": include({
    strata: [...BACK_DENSE, "missing-alcohol-statement"],
    notes:
      "Chateau de Laville back label with descriptive estate text and no alcohol statement visible anywhere on the committed image.",
    brand: brandPresent(["Chateau de Laville"], {
      forbiddenPresentations: ["Cadillac Cotes de Bordeaux"],
    }),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
  }),
  "approved-wine-026": include({
    strata: [...FRONT_COMPLEX, "alcohol-at-bottom"],
    notes:
      "Principe Diphesa is the dominant title while Francesca Fiasco appears as a smaller producer line above it.",
    brand: brandPresent(["Principe Diphesa"], {
      forbiddenPresentations: ["Francesca Fiasco", "Paestum"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13.5% BY VOL.", "13.5%"]),
  }),
  "approved-wine-027": include({
    strata: [...FRONT_SCRIPT, "brand-punctuation", "alcohol-at-bottom"],
    notes:
      "The Golden Girls red blend panel with the TV-show-style title as the consumer-facing name and a 13.5% alc/vol footer.",
    brand: brandPresent(["The Golden Girls", "Golden Girls"], {
      forbiddenPresentations: ["Red Wine Blend"],
    }),
    alcohol: presentAlcohol([13.5], ["13.5% alc./vol", "13.5%"]),
  }),
  "approved-wine-028": include({
    strata: [...FRONT_SIMPLE, "alcohol-at-side-or-rotated"],
    notes:
      "Field Vineyards descriptive panel with the brand carried at top and a vertical 13.3% by volume statement printed in the right edge strip.",
    brand: brandPresent(["Field", "Field Vineyards"], {
      forbiddenPresentations: ["Red Wine Blend"],
    }),
    alcohol: presentAlcohol([13.3], ["ALC 13.3% BY VOL", "13.3% BY VOL", "13.3%"], {
      orientation: "vertical-counterclockwise",
    }),
  }),
  "approved-wine-029": exclude({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    reason:
      "The artwork shows a placeholder ABV range of '11-14% by vol.' rather than a determinate alcohol value, so exact alcohol truth cannot be assigned honestly.",
  }),
  "approved-wine-030": exclude({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    reason:
      "The artwork shows a placeholder ABV range of '11-14% by vol.' rather than a determinate alcohol value, so exact alcohol truth cannot be assigned honestly.",
  }),
  "approved-wine-031": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "embeleso back label with the stylized house name at top and a determinate 13.5% by volume footer line.",
    brand: brandPresent(["embeleso"], {
      forbiddenPresentations: ["Crianza", "Tempranillo"],
    }),
    alcohol: presentAlcohol([13.5], ["Alc. 13.5% by Vol", "13.5%"]),
  }),
  "approved-wine-032": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Travers Reserve Saint-Emilion panel with the brand line at top and a standard 14% by volume footer line.",
    brand: brandPresent(["Travers Reserve"], {
      forbiddenPresentations: ["Saint-Emilion"],
    }),
    alcohol: presentAlcohol([14], ["ALC. 14% BY VOL", "14%"]),
  }),
  "approved-wine-033": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Haywater Cove Night Swimming text label with the winery name repeated and a determinate 13.7% alcohol footer.",
    brand: brandPresent(["Haywater Cove"], {
      forbiddenPresentations: ["Night Swimming", "Red Wine Blend"],
    }),
    alcohol: presentAlcohol([13.7], ["13.7% Alc. by Vol.", "13.7%"]),
  }),
  "approved-wine-034": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Nico back panel with the single-word house name at top and a small 13.5% by vol footer line below the description.",
    brand: brandPresent(["Nico"], {
      forbiddenPresentations: ["Malbec", "Rosas Plant Selection"],
    }),
    alcohol: presentAlcohol([13.5], ["13.5% BY VOL", "13.5%"]),
  }),
  "approved-wine-035": include({
    strata: [...FRONT_SCRIPT, "alcohol-at-side-or-rotated"],
    notes:
      "Hubert Lamy front label with the wine title centered and the 13.5% vol statement printed vertically in the right strip.",
    brand: brandPresent(["Hubert Lamy"], {
      forbiddenPresentations: ["Chassagne-Montrachet", "La Goujonne"],
    }),
    alcohol: presentAlcohol([13.5], ["13.5% vol", "13.5%"], {
      orientation: "vertical-counterclockwise",
    }),
  }),
  "approved-wine-036": exclude({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    reason:
      "The artwork shows a placeholder ABV range of '11-14% by vol.' rather than a determinate alcohol value, so exact alcohol truth cannot be assigned honestly.",
  }),
  "approved-wine-037": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Touch Shiraz back panel with the stylized house name near the top and a determinate 13.0% by volume statement above the net-volume line.",
    brand: brandPresent(["Touch"], {
      forbiddenPresentations: ["Shiraz"],
    }),
    alcohol: presentAlcohol([13], ["Alcohol 13.0 % by volume", "13.0%", "13%"]),
  }),
  "approved-wine-038": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Big Red Sunshine narrative label with the product name dominating and a direct 13.5% by vol footer line.",
    brand: brandPresent(["Big Red Sunshine"], {
      forbiddenPresentations: ["Primitivo"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13.5% BY VOL.", "13.5%"]),
  }),
  "approved-wine-039": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Domaine Julien Auroux export label with Itineraire Bis as the cuvee line and a determinate 13.5% footer statement.",
    brand: brandPresent(["Domaine Julien Auroux"], {
      forbiddenPresentations: ["Itineraire Bis", "Rouge"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13.5% BY VOL.", "13.5%"]),
  }),
  "approved-wine-041": include({
    strata: [...BACK_GENERIC, "alcohol-at-bottom"],
    notes:
      "Minimal Petite Nature label with the product name at top-left and a clean 13.0% alc/vol statement in the left text block.",
    brand: brandPresent(["Petite Nature"], {
      forbiddenPresentations: ["Sorcieres", "Red Wine"],
    }),
    alcohol: presentAlcohol([13], ["13.0% alc/vol", "13.0%", "13%"]),
  }),
  "approved-wine-042": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Domaine Quivy export panel for Chapelle Chambertin Grand Cru with a comma-decimal 13,5% by volume footer line.",
    brand: brandPresent(["Domaine Quivy"], {
      forbiddenPresentations: ["Chapelle Chambertin Grand Cru", "MISA"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13,5% BY VOL.", "13.5%", "13,5%"]),
  }),
  "approved-wine-043": include({
    strata: [...FRONT_SIMPLE, "low-contrast", "alcohol-at-bottom"],
    notes:
      "Fulcrum Pinot Noir panel with a low-contrast cream-on-charcoal treatment and a small 13% by volume footer line.",
    brand: brandPresent(["Fulcrum"], {
      forbiddenPresentations: ["Pinot Noir"],
    }),
    alcohol: presentAlcohol([13], ["ALC. 13% BY VOL.", "13%"]),
  }),
  "approved-wine-044": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Sweet Seduction back label with the house name large at top and a clear 13.5% by volume line near the footer.",
    brand: brandPresent(["Sweet Seduction"], {
      forbiddenPresentations: ["Cabernet-Sauvignon"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13.5% BY VOL.", "13.5%"]),
  }),
  "approved-wine-045": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Meeting of the Minds narrative label with the title line above the descriptive copy and a 13.7% alc/vol footer line.",
    brand: brandPresent(["Meeting of the Minds"], {
      forbiddenPresentations: ["Folktale Winery", "Red Wine Blend"],
    }),
    alcohol: presentAlcohol([13.7], ["13.7% ALC/VOL.", "13.7%"]),
  }),
  "approved-wine-046": include({
    strata: [...BACK_DENSE, "missing-alcohol-statement"],
    notes:
      "Curious back label with the quoted cuvee title carried at the top and no alcohol statement visible on the panel.",
    brand: brandPresent(["Curious"], {
      forbiddenPresentations: ["Macchia", "Red Wine Blend"],
    }),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
  }),
  "approved-wine-047": include({
    strata: [...FRONT_COMPLEX, "alcohol-at-bottom"],
    notes:
      "Etiris GX front panel with Art Laieta shown as the producer mark and a determinate 14% by volume statement in the right column.",
    brand: brandPresent(["Etiris GX"], {
      forbiddenPresentations: ["Art Laieta", "Garnatxa Negra"],
    }),
    alcohol: presentAlcohol([14], ["Alc. 14% by Vol.", "14%"]),
    confidence: { overall: "medium", brand: "medium", alcohol: "high" },
  }),
  "approved-wine-048": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Pacha Carmenere narrative label with the brand large at top and a comma-decimal 14,0% alcohol statement above the barcode.",
    brand: brandPresent(["Pacha"], {
      forbiddenPresentations: ["Carmenere", "Andes Wine Imports"],
    }),
    alcohol: presentAlcohol([14], ["Alc. 14,0% by Vol.", "14.0%", "14,0%"]),
  }),
  "approved-wine-049": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Caywood Vineyard sustainability panel with the vineyard name highlighted and a 13.2% by volume line at the bottom edge.",
    brand: brandPresent(["Caywood Vineyard"], {
      forbiddenPresentations: ["Damiani Wine Cellars", "Cabernet Sauvignon"],
    }),
    alcohol: presentAlcohol([13.2], ["Alc 13.2% by Vol", "13.2%"]),
  }),
  "approved-wine-051": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Pacheca Reserva Vinhas Velhas back label with the house name at top-left and a large 13.5% vol statement centered near the bottom.",
    brand: brandPresent(["Pacheca"], {
      forbiddenPresentations: ["Reserva Vinhas Velhas", "Douro"],
    }),
    alcohol: presentAlcohol([13.5], ["Alc.13.5%vol", "13.5%"]),
  }),
  "approved-wine-052": include({
    strata: [...BACK_DENSE, "missing-alcohol-statement"],
    notes:
      "Mountain Valley Winery panel with the winery name prominent and no alcohol statement visible on the committed image.",
    brand: brandPresent(["Mountain Valley Winery"], {
      forbiddenPresentations: ["Old Vine Zinfandel"],
    }),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
  }),
  "approved-wine-053": include({
    strata: [...FRONT_COMPLEX, "alcohol-at-side-or-rotated"],
    notes:
      "Golden Road Vineyards Uisce Beatha panel with the 11.5% alc/vol statement printed vertically in the right-side strip.",
    brand: brandPresent(["Golden Road Vineyards"], {
      forbiddenPresentations: ["Uisce Beatha", "Traminette"],
    }),
    alcohol: presentAlcohol([11.5], ["11.5% ALC/VOL", "11.5%"], {
      orientation: "vertical-counterclockwise",
    }),
  }),
  "approved-wine-054": include({
    strata: [...BACK_SIMPLE, "alcohol-at-side-or-rotated"],
    notes:
      "Henri Dufreres export panel with the 12.5% alcohol statement printed vertically in the central rule block.",
    brand: brandPresent(["Henri Dufreres"], {
      forbiddenPresentations: ["Coteaux Bourguignons"],
    }),
    alcohol: presentAlcohol([12.5], ["12.5% Alc. by Vol", "12.5%"], { orientation: "mixed" }),
  }),
  "approved-wine-055": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Francois Villard export panel with the producer name above the cuvee line and a clean 13% by vol footer statement.",
    brand: brandPresent(["Francois Villard"], {
      forbiddenPresentations: ["Gran Reflet", "Saint Joseph"],
    }),
    alcohol: presentAlcohol([13], ["ALC.13% BY VOL", "13%"]),
  }),
  "approved-wine-056": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom", "low-contrast"],
    notes:
      "Washed-out Prinsi Camp d'Pietru label with the house name still legible and a determinate 13.5% by volume line.",
    brand: brandPresent(["Prinsi"], {
      forbiddenPresentations: ["Camp d'Pietru"],
    }),
    alcohol: presentAlcohol([13.5], ["Alcohol 13.5% by Volume", "13.5%"]),
    confidence: { overall: "medium", brand: "medium", alcohol: "high" },
  }),
  "approved-wine-057": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Prinsi Camp d'Pietru label with a clearer scan than approved-wine-056 and a determinate 13% by volume line.",
    brand: brandPresent(["Prinsi"], {
      forbiddenPresentations: ["Camp d'Pietru"],
    }),
    alcohol: presentAlcohol([13], ["Alcohol 13% by Volume", "13%"]),
  }),
  "approved-wine-058": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Generic Gruner Veltliner export label with a clear 12% alc/vol statement but no distinct brand separate from the producer and importer lines.",
    brand: brandAbsent(
      "The image shows varietal and regional text plus producer details, but no distinct brand presentation.",
      { forbiddenPresentations: ["Gruner Veltliner", "Lenz Moser"] },
    ),
    alcohol: presentAlcohol([12], ["12% ALC./VOL.", "12%"]),
  }),
  "approved-wine-059": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Roero Arneis label with a small Domenico Negro banner crest and a determinate 13.5% by vol footer line.",
    brand: brandPresent(["Domenico Negro", "Dominico Negro"], {
      forbiddenPresentations: ["Roero Arneis"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC 13,5% by vol.", "13.5%"]),
    confidence: { overall: "medium", brand: "medium", alcohol: "high" },
  }),
  "approved-wine-061": include({
    strata: [...LOW_RES_BACK, "missing-alcohol-statement"],
    notes:
      "Tiny Aphrodite dessert-wine panel centered in a large scan area; the brand is legible but no alcohol statement is visible.",
    brand: brandPresent(["Aphrodite"], {
      forbiddenPresentations: ["Gewurztraminer"],
    }),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
    confidence: { overall: "medium", brand: "medium", alcohol: "medium" },
  }),
  "approved-wine-062": include({
    strata: [...LOW_RES_BACK, "missing-alcohol-statement"],
    notes:
      "Very small Pinot Grigio descriptive label centered in a large scan area with no distinct brand or alcohol statement visible.",
    brand: brandAbsent(
      "The committed image shows only generic varietal text and no distinct brand presentation.",
      { forbiddenPresentations: ["Pinot Grigio"] },
    ),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
    confidence: { overall: "medium", brand: "medium", alcohol: "medium" },
  }),
  "approved-wine-063": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Prinsi Tre Fichi back label with the house name at top and a determinate 13% by volume footer line.",
    brand: brandPresent(["Prinsi"], {
      forbiddenPresentations: ["Tre Fichi", "Chardonnay"],
    }),
    alcohol: presentAlcohol([13], ["ALC. 13% by VOL.", "13%"]),
  }),
  "approved-wine-064": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes: "Prinsi Il Nespolo back label with a determinate 13.5% by volume footer line.",
    brand: brandPresent(["Prinsi"], {
      forbiddenPresentations: ["Il Nespolo", "Arneis"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13.5% by VOL.", "13.5%"]),
  }),
  "approved-wine-065": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Prinsi Campi d'Pietru Sauvignon label with the house name at top and a determinate 13% by volume footer line.",
    brand: brandPresent(["Prinsi"], {
      forbiddenPresentations: ["Campi d'Pietru", "Sauvignon"],
    }),
    alcohol: presentAlcohol([13], ["ALC. 13% by VOL.", "13%"]),
  }),
  "approved-wine-066": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Domaine Juliette Avril Chateauneuf-du-Pape export panel with a direct 13% by vol statement near the top center.",
    brand: brandPresent(["Domaine Juliette Avril"], {
      forbiddenPresentations: ["Chateauneuf-du-Pape"],
    }),
    alcohol: presentAlcohol([13], ["ALC. 13% BY VOL.", "13%"]),
  }),
  "approved-wine-067": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Domaine Juliette Avril Mediterranee white-wine panel with a direct 13% by vol statement near the top center.",
    brand: brandPresent(["Domaine Juliette Avril"], {
      forbiddenPresentations: ["Mediterranee", "Viognier"],
    }),
    alcohol: presentAlcohol([13], ["ALC. 13% BY VOL.", "13%"]),
  }),
  "approved-wine-068": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Langhe Arneis label with SARA as the consumer-facing title and the producer names confined to the bottler statement.",
    brand: brandPresent(["Sara"], {
      forbiddenPresentations: ["Arneis", "Carlo Giacosa", "Giacosa Maria Grazia"],
    }),
    alcohol: presentAlcohol([13], ["ALC. 13% BY VOL.", "13%"]),
  }),
  "approved-wine-069": include({
    strata: [...BACK_SIMPLE, "low-contrast", "alcohol-at-bottom"],
    notes:
      "AltaCima 4.090 Chardonnay Reserva panel in low-contrast gray-on-charcoal styling with a 13.5% alcohol footer.",
    brand: brandPresent(["AltaCima 4.090", "AltaCima"], {
      forbiddenPresentations: ["Chardonnay", "Reserva"],
    }),
    alcohol: presentAlcohol([13.5], ["13.5% Alc. by Vol.", "13.5%"]),
  }),
  "approved-wine-071": include({
    strata: [...BACK_SIMPLE, "low-contrast", "alcohol-at-bottom"],
    notes:
      "AltaCima 6.330 Late Harvest Gewurztraminer panel with a determinate 13.5% alcohol footer.",
    brand: brandPresent(["AltaCima 6.330", "AltaCima"], {
      forbiddenPresentations: ["Late Harvest", "Gewurztraminer"],
    }),
    alcohol: presentAlcohol([13.5], ["13.5% Alc. by Vol.", "13.5%"]),
  }),
  "approved-wine-072": include({
    strata: [...BACK_DENSE, "missing-alcohol-statement"],
    notes:
      "Ava Gardner tribute label with the thematic name repeated in decorative script while Hinnant Family Vineyards appears only in the producer block.",
    brand: brandPresent(["Ava Gardner"], {
      genuinelyAmbiguous: true,
      ambiguityReason:
        "The thematic title 'Ava Gardner' dominates the artwork while the winery identity appears only in the producer text block.",
      forbiddenPresentations: ["Hinnant Family Vineyards", "Blanc du Bois"],
    }),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
    confidence: { overall: "medium", brand: "medium", alcohol: "high" },
  }),
  "approved-wine-073": include({
    strata: [...BACK_SIMPLE, "missing-alcohol-statement"],
    notes:
      "Mike's Farm, Inc. contact-style panel with the business name prominent and no alcohol statement visible on the artwork.",
    brand: brandPresent(["Mike's Farm, Inc.", "Mike's Farm"], {
      forbiddenPresentations: ["Hinnant Family Vineyard"],
    }),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
  }),
  "approved-wine-074": include({
    strata: [...BACK_SIMPLE, "missing-alcohol-statement"],
    notes:
      "Second Mike's Farm, Inc. contact-style panel in orange with no alcohol statement visible on the committed image.",
    brand: brandPresent(["Mike's Farm, Inc.", "Mike's Farm"], {
      forbiddenPresentations: ["Hinnant Vineyards"],
    }),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
  }),
  "approved-wine-075": include({
    strata: [...BACK_DENSE, "missing-alcohol-statement"],
    notes:
      "Generic Sauvignon Blanc export panel with descriptive copy and no distinct brand or alcohol statement visible.",
    brand: brandAbsent(
      "The image shows only generic varietal text and descriptive copy, not a distinct brand presentation.",
      { forbiddenPresentations: ["Sauvignon Blanc", "La Baltana Vella"] },
    ),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
  }),
  "approved-wine-076": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Etim Blanc back label with the house name at top and a comma-decimal 13,5% alc/vol statement near the footer.",
    brand: brandPresent(["Etim"], {
      forbiddenPresentations: ["Blanc"],
    }),
    alcohol: presentAlcohol([13.5], ["13,5% ALC./VOL.", "13.5%", "13,5%"]),
  }),
  "approved-wine-077": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Valdinera Roero Arneis back label with a direct 13.5% by vol statement in the opening text block.",
    brand: brandPresent(["Valdinera"], {
      forbiddenPresentations: ["Roero Arneis"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC.13.5% BYVOL", "13.5%"]),
  }),
  "approved-wine-078": include({
    strata: [...FRONT_COMPLEX, "alcohol-at-bottom"],
    notes:
      "Pietta Chardonnay / Garda front-back composite panel with a direct 14% by volume line in the right information column.",
    brand: brandPresent(["Pietta"], {
      forbiddenPresentations: ["Chardonnay", "Garda"],
    }),
    alcohol: presentAlcohol([14], ["ALCOHOL 14% BY VOLUME", "14%"]),
  }),
  "approved-wine-079": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Le Caniette Offida Pecorino export label with the producer name repeated and a comma-decimal 13,5% by volume statement.",
    brand: brandPresent(["Le Caniette"], {
      forbiddenPresentations: ["Offida", "Pecorino"],
    }),
    alcohol: presentAlcohol([13.5], ["13,5 % BY VOLUME", "13.5%", "13,5%"]),
  }),
  "approved-wine-081": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Corte Adagio text-only back label with a direct 12% by vol line above the net-contents statement.",
    brand: brandPresent(["Corte Adagio"], {
      forbiddenPresentations: ["Chardonnay"],
    }),
    alcohol: presentAlcohol([12], ["ALC 12 % BY VOL", "12%"]),
  }),
  "approved-wine-082": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom", "low-contrast"],
    notes:
      "Low-contrast Chardonnay Livermore Valley label with no distinct title beyond the varietal and a determinate 14.0% by volume line.",
    brand: brandAbsent(
      "The image presents only generic varietal and region text plus the producer statement, not a distinct brand presentation.",
      { forbiddenPresentations: ["Chardonnay", "3 Steves Winery"] },
    ),
    alcohol: presentAlcohol([14], ["ALCOHOL 14.0% BY VOLUME", "14.0%", "14%"]),
  }),
  "approved-wine-083": include({
    strata: [...FRONT_SCRIPT, "alcohol-at-bottom"],
    notes:
      "Barn Sill Wine Co. Christmas Hayride label with the winery name at top and a determinate 12% alc/vol line near the lower center.",
    brand: brandPresent(["Barn Sill Wine Co.", "Barn Sill Wine Co"], {
      forbiddenPresentations: ["Christmas Hayride", "North Carolina Muscadine Wine"],
    }),
    alcohol: presentAlcohol([12], ["12% ALC./VOL.", "12%"]),
  }),
  "approved-wine-084": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Filadoro Fiano di Avellino panel with the winery name prominent in the producer line and a determinate 13.5% by volume statement.",
    brand: brandPresent(["Filadoro"], {
      forbiddenPresentations: ["Fiano di Avellino", "White Wine Vintage 2017"],
    }),
    alcohol: presentAlcohol([13.5], ["13,5% Alc. By Vol.", "13.5%", "13,5%"]),
    confidence: { overall: "medium", brand: "medium", alcohol: "high" },
  }),
  "approved-wine-085": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Mosaikon Grillo panel with the scripted house name at top and a comma-decimal 13,5% by vol line above the footer.",
    brand: brandPresent(["Mosaikon"], {
      forbiddenPresentations: ["Grillo"],
    }),
    alcohol: presentAlcohol([13.5], ["Alc.13,5% by vol.", "13.5%", "13,5%"]),
  }),
  "approved-wine-086": include({
    strata: [...BACK_DENSE, "missing-alcohol-statement"],
    notes:
      "3 Steves Winery narrative panel for the Curious blend with no alcohol statement visible on the committed image.",
    brand: brandPresent(["3 Steves Winery"], {
      forbiddenPresentations: ["Curious"],
    }),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
  }),
  "approved-wine-087": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Viridis Langhe Sauvignon panel with the cuvee name at top and a determinate 13.5% by volume footer line.",
    brand: brandPresent(["Viridis"], {
      forbiddenPresentations: ["Langhe Sauvignon", "Marina Burlotto"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13.5% BY VOL.", "13.5%"]),
  }),
  "approved-wine-088": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "La Mesma Yellow Label Gavi panel with the house name at top and a comma-decimal 12,5% alcohol statement.",
    brand: brandPresent(["La Mesma"], {
      forbiddenPresentations: ["Yellow Label", "Gavi"],
    }),
    alcohol: presentAlcohol([12.5], ["ALCOHOL 12,5% BY VOL", "12.5%", "12,5%"]),
  }),
  "approved-wine-089": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "La Mesma Black Label Gavi panel with the house name at top and a direct 13% by vol statement.",
    brand: brandPresent(["La Mesma"], {
      forbiddenPresentations: ["Black Label", "Gavi"],
    }),
    alcohol: presentAlcohol([13], ["ALCOHOL 13% BY VOL", "13%"]),
  }),
  "approved-wine-090": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "La Mesma Indi Gavi panel with the house name at top and a comma-decimal 12,5% alcohol statement.",
    brand: brandPresent(["La Mesma"], {
      forbiddenPresentations: ["Indi", "Gavi"],
    }),
    alcohol: presentAlcohol([12.5], ["ALCOHOL 12,5% BY VOL", "12.5%", "12,5%"]),
  }),
  "approved-wine-091": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Rias Vermentino di Gallura panel with the cuvee name at top-left and a comma-decimal 13,5% by vol footer line.",
    brand: brandPresent(["Rias"], {
      forbiddenPresentations: ["Vermentino di Gallura", "Tenute Gregu"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13,5% by vol.", "13.5%", "13,5%"]),
  }),
  "approved-wine-092": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Twin Suns white blend narrative label with the house name at left and a determinate 13.6% by vol footer line.",
    brand: brandPresent(["Twin Suns"], {
      forbiddenPresentations: ["Paso Robles", "Santa Barbara"],
    }),
    alcohol: presentAlcohol([13.6], ["ALC 13.6% by Vol", "13.6%"]),
  }),
  "approved-wine-093": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Fontanavecchia Taburno Falanghina panel with the house name at top and a comma-decimal 13,50% by vol statement.",
    brand: brandPresent(["Fontanavecchia"], {
      forbiddenPresentations: ["Taburno", "Falanghina del Sannio"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13,50% BY VOL.", "13.5%", "13,50%"]),
  }),
  "approved-wine-094": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Fontanavecchia Sannio Fiano panel with the house name at top and a comma-decimal 13,50% by vol statement.",
    brand: brandPresent(["Fontanavecchia"], {
      forbiddenPresentations: ["Sannio", "Fiano"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13,50% BY VOL.", "13.5%", "13,50%"]),
  }),
  "approved-wine-095": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom", "low-resolution"],
    notes:
      "Compact Etna Bianco export panel with a determinate 12% by volume line but no distinct brand separate from the producer statement.",
    brand: brandAbsent(
      "The artwork shows generic appellation text and producer details, but no distinct brand presentation.",
      { forbiddenPresentations: ["Etna Bianco DOC", "Tenute Bosco"] },
    ),
    alcohol: presentAlcohol([12], ["ALC.12% BY VOL.", "12%"]),
    confidence: { overall: "medium", brand: "medium", alcohol: "high" },
  }),
  "approved-wine-096": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Generic Delle Venezie Pinot Grigio export label with a determinate 12% by volume line but no distinct brand mark.",
    brand: brandAbsent(
      "The artwork presents appellation and bottler information without a distinct brand presentation.",
      { forbiddenPresentations: ["Delle Venezie", "Pinot Grigio"] },
    ),
    alcohol: presentAlcohol([12], ["ALC.12% BY VOL.", "12%"]),
  }),
  "approved-wine-097": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Generic Chardonnay Veneto export label with a determinate 12% by volume line but no distinct brand mark.",
    brand: brandAbsent(
      "The artwork presents varietal and bottler information without a distinct brand presentation.",
      { forbiddenPresentations: ["Chardonnay Veneto", "Chardonnay"] },
    ),
    alcohol: presentAlcohol([12], ["ALC.12% BY VOL.", "12%"]),
  }),
  "approved-wine-098": include({
    strata: [...LOW_RES_BACK, "alcohol-at-bottom"],
    notes:
      "Low-resolution Ribolla Gialla export panel with a determinate 12.5% by volume line but no distinct brand presentation.",
    brand: brandAbsent(
      "The committed image shows generic varietal text and a producer statement, not a distinct brand mark.",
      { forbiddenPresentations: ["Ribolla Gialla", "Blazic"] },
    ),
    alcohol: presentAlcohol([12.5], ["ALC 12.5% BY VOL", "12.5%"]),
    confidence: { overall: "medium", brand: "medium", alcohol: "high" },
  }),
  "approved-wine-099": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Fontanavecchia Sannio Greco panel with the house name at top and a comma-decimal 13,50% by vol statement.",
    brand: brandPresent(["Fontanavecchia"], {
      forbiddenPresentations: ["Sannio", "Greco"],
    }),
    alcohol: presentAlcohol([13.5], ["ALC. 13,50% BY VOL.", "13.5%", "13,50%"]),
  }),
  "approved-wine-101": include({
    strata: [...BACK_DENSE, "missing-alcohol-statement"],
    notes:
      "Generic Sauvignon Blanc descriptive back label with no named brand and no alcohol statement visible anywhere on the panel.",
    brand: brandAbsent(
      "The artwork shows only varietal description and no distinct brand presentation.",
      { forbiddenPresentations: ["Sauvignon Blanc"] },
    ),
    alcohol: absentAlcohol("No alcohol statement appears on the committed label image."),
  }),
  "approved-wine-102": include({
    strata: [...BACK_DENSE, "alcohol-at-bottom"],
    notes:
      "Twin Suns blend narrative panel with the house name at left and a determinate 13.4% by vol footer line.",
    brand: brandPresent(["Twin Suns"], {
      forbiddenPresentations: ["Chardonnay", "Viognier"],
    }),
    alcohol: presentAlcohol([13.4], ["ALC 13.4% by Vol", "13.4%"]),
  }),
  "approved-wine-103": include({
    strata: [...FRONT_COMPLEX, "alcohol-at-bottom"],
    notes:
      "Tenute Valso / Aphor Grillo panel with the winery name at top, the cuvee line below it, and a determinate 13% by volume statement.",
    brand: brandPresent(["Tenute Valso"], {
      forbiddenPresentations: ["Aphor", "Grillo"],
    }),
    alcohol: presentAlcohol([13], ["Alc. 13% by VOL", "13%"]),
    confidence: { overall: "medium", brand: "medium", alcohol: "high" },
  }),
  "approved-wine-104": include({
    strata: [...FRONT_COMPLEX, "alcohol-at-bottom"],
    notes:
      "Blazic Collio Chardonnay composite panel with the house name dominant and a 13% by vol statement on the right information block.",
    brand: brandPresent(["Blazic"], {
      forbiddenPresentations: ["Collio", "Chardonnay"],
    }),
    alcohol: presentAlcohol([13], ["Alc.13% by vol", "13%"]),
  }),
  "approved-wine-105": include({
    strata: [...FRONT_SCRIPT, "multiple-brand-like-phrases", "alcohol-at-bottom"],
    notes:
      "Luigi & Giovanni Moscato label with the familiar house mark and a small 12.5% ALC footer block at lower-right.",
    brand: brandPresent(["Luigi & Giovanni"], {
      forbiddenPresentations: ["Taste of Italy", "Moscato"],
    }),
    alcohol: presentAlcohol([12.5], ["12.5% ALC", "12.5%"]),
  }),
  "approved-wine-106": include({
    strata: [...FRONT_SIMPLE, "multiple-brand-like-phrases", "alcohol-at-bottom"],
    notes:
      "Alfredo's Wine white-label panel with the house name at top and a small 12.5% ALC footer block at lower-right.",
    brand: brandPresent(["Alfredo's Wine", "Alfredos Wine"], {
      forbiddenPresentations: ["White Wine"],
    }),
    alcohol: presentAlcohol([12.5], ["12.5% ALC", "12.5%"]),
  }),
  "approved-wine-107": include({
    strata: [...WRAP_SIDE],
    notes:
      "La Fattoria Chardonnay wrap label with the brand centered and the 13.5% ALC statement rotated into the left mandatory strip.",
    brand: brandPresent(["La Fattoria"]),
    alcohol: presentAlcohol([13.5], ["13.5% ALC", "13.5%"], {
      orientation: "vertical-clockwise",
    }),
  }),
  "approved-wine-108": include({
    strata: [...WRAP_SIDE],
    notes:
      "La Fattoria Vino Bianco wrap label with the brand centered and the 12.5% ALC statement rotated into the left mandatory strip.",
    brand: brandPresent(["La Fattoria"]),
    alcohol: presentAlcohol([12.5], ["12.5% ALC", "12.5%"], {
      orientation: "vertical-clockwise",
    }),
  }),
  "approved-wine-109": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Sangouard-Chene Chablis export panel with a comma-decimal 12,5% by vol statement at the bottom-left.",
    brand: brandPresent(["Sangouard-Chene"], {
      forbiddenPresentations: ["Chablis"],
    }),
    alcohol: presentAlcohol([12.5], ["ALC. 12,5% BY VOL.", "12.5%", "12,5%"]),
  }),
  "approved-wine-110": include({
    strata: [...BACK_SIMPLE, "alcohol-at-bottom"],
    notes:
      "Cooley Bay Barrel Aged Roussanne panel with the house name at top and a determinate 12.8% by volume statement near the footer.",
    brand: brandPresent(["Cooley Bay"], {
      forbiddenPresentations: ["Roussanne"],
    }),
    alcohol: presentAlcohol([12.8], ["Alcohol 12.8% by Volume", "12.8%"]),
  }),
  "wine-multi-artifact-04": include({
    strata: [...MULTI_PANEL, "alcohol-at-bottom"],
    notes:
      "Dry Cellar composite showing a front Sauvignon Blanc panel and a back text panel with a determinate 13.2% by volume statement.",
    brand: brandPresent(["Dry Cellar"], {
      forbiddenPresentations: ["Sauvignon Blanc"],
    }),
    alcohol: presentAlcohol([13.2], ["Alc. 13.2% by Vol.", "13.2%"]),
  }),
  "wine-multi-artifact-05": include({
    strata: [...MULTI_PANEL, "alcohol-at-bottom"],
    notes:
      "Blazic Collio Sauvignon composite with a separate back panel that preserves a determinate 13.5% alcohol statement.",
    brand: brandPresent(["Blazic"], {
      forbiddenPresentations: ["Sauvignon", "Collio"],
    }),
    alcohol: presentAlcohol([13.5], ["13.5% vol", "13.5%"]),
  }),
  "wine-multi-artifact-06": include({
    strata: [...MULTI_PANEL, "alcohol-at-side-or-rotated"],
    notes:
      "Mauro Molino Livrot Langhe Chardonnay composite with the 13,4% alcohol printed vertically on the front label edge.",
    brand: brandPresent(["Mauro Molino"], {
      forbiddenPresentations: ["Livrot", "Chardonnay"],
    }),
    alcohol: presentAlcohol([13.4], ["Alc. 13,4% vol.", "13.4%", "13,4%"], {
      orientation: "mixed",
    }),
  }),
  "wine-multi-artifact-07": include({
    strata: [...MULTI_PANEL, "missing-alcohol-statement"],
    notes:
      "Mike's Farm Scuppernong White composite with a distinct front title panel but no alcohol statement visible on the committed composite.",
    brand: brandPresent(["Mike's Farm", "Mike's Farm, Inc."]),
    alcohol: absentAlcohol("No alcohol statement appears on the committed composite image."),
  }),
  "wine-multi-artifact-08": include({
    strata: [...MULTI_PANEL, "alcohol-at-bottom"],
    notes:
      "Pindar Gewurztraminer composite with the front technical panel carrying a determinate 12.6% by volume statement.",
    brand: brandPresent(["Pindar"], {
      forbiddenPresentations: ["Gewurztraminer"],
    }),
    alcohol: presentAlcohol([12.6], ["Alc. 12.6% by vol.", "12.6%"]),
  }),
  "wine-multi-artifact-09": include({
    strata: [...MULTI_PANEL, "alcohol-at-bottom"],
    notes:
      "Duck Walk Vineyards Chardonnay composite with the front label carrying a direct 12.5% by volume statement.",
    brand: brandPresent(["Duck Walk Vineyards"], {
      forbiddenPresentations: ["Chardonnay"],
    }),
    alcohol: presentAlcohol([12.5], ["ALC. 12.5% BY VOL.", "12.5%"]),
  }),
  "wine-multi-artifact-10": include({
    strata: [...MULTI_PANEL, "alcohol-at-side-or-rotated"],
    notes:
      "Mauro Molino Roero Arneis composite with the 14% vol statement printed vertically on the front label edge.",
    brand: brandPresent(["Mauro Molino"], {
      forbiddenPresentations: ["Roero Arneis"],
    }),
    alcohol: presentAlcohol([14], ["ALC. 14% vol.", "14%"], { orientation: "mixed" }),
  }),
};
