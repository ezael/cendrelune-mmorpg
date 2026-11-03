/**
 * Niveau de qualité graphique. Par défaut « haute » ; ajoute ?qualite=basse à
 * l'adresse pour un ordinateur moins puissant.
 */
const param = typeof location !== "undefined" ? new URLSearchParams(location.search).get("qualite") : null;
export const LOW_QUALITY = param === "basse";
