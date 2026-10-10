/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#25222b',
    tint: '#f16f50',

    // Core surfaces
    background: '#fffaf1',
    foreground: '#25222b',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#25222b',

    // Primary action color (buttons, links, active states)
    primary: '#f16f50',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#312d36',
    secondaryForeground: '#ffffff',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#f4efe6',
    mutedForeground: '#858079',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#e6f1e9',
    accentForeground: '#2e6b58',

    // Destructive actions (delete, error states)
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#eee8dc',
    input: '#eee8dc',
    success: '#439575',
    preview: '#f2e8d8',
    surfaceAccent: '#f4efe6',
    highlight: '#ffd789',
  },

  dark: {
    text: '#faf4e9',
    tint: '#ff8a69',
    background: '#211f24',
    foreground: '#faf4e9',
    card: '#2c2930',
    cardForeground: '#faf4e9',
    primary: '#ff8a69',
    primaryForeground: '#211f24',
    secondary: '#3d3942',
    secondaryForeground: '#faf4e9',
    muted: '#39353d',
    mutedForeground: '#aaa3a8',
    accent: '#30463d',
    accentForeground: '#a7dbc3',
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',
    border: '#413d45',
    input: '#413d45',
    success: '#68b997',
    preview: '#302c30',
    surfaceAccent: '#39353d',
    highlight: '#ffd789',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 16,
};

export default colors;
