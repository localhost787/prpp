export const palette = Object.freeze({
  ink: '#172B4D',
  muted: '#425570',
  blue: '#063B9E',
  blueHover: '#052F7E',
  bluePressed: '#042663',
  brandRed: '#EF0B2B', // Coquí/accent only; use darker red for normal text.
  red: '#B20823',
  redHover: '#8D061C',
  canvas: '#F3F6FB',
  white: '#FFFFFF',
  border: '#52647A',
  borderSoft: '#DCE4EF',
  pale: '#EAF0FB',
  palePressed: '#D8E4F7',
  disabled: '#EDF1F6',
  disabledText: '#52647A',
  notice: '#FFF4CE',
  success: '#176044',
  warning: '#784D00',
});

export const radii = Object.freeze({ control: 10, surface: 16, pill: 999 });
export const spacing = Object.freeze({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 });
export const controlSizes = Object.freeze({ compact: 44, regular: 48 });

const variants = Object.freeze({
  primary: {
    background: palette.blue,
    hover: palette.blueHover,
    pressed: palette.bluePressed,
    border: palette.blue,
    text: palette.white,
  },
  secondary: {
    background: palette.white,
    hover: palette.pale,
    pressed: palette.palePressed,
    border: palette.border,
    text: palette.blue,
  },
  ghost: {
    background: 'transparent',
    hover: palette.pale,
    pressed: palette.palePressed,
    border: 'transparent',
    text: palette.blue,
  },
  destructive: {
    background: palette.white,
    hover: '#FFF0F2',
    pressed: palette.red,
    border: palette.red,
    text: palette.red,
    pressedText: palette.white,
  },
});

export const buttonVariants = Object.freeze(Object.keys(variants));

export function buttonVisualState({
  variant = 'secondary',
  selected = false,
  disabled = false,
  hovered = false,
  pressed = false,
  focused = false,
} = {}) {
  const source = variants[variant] ?? variants.secondary;
  const emphasized = selected && !disabled;
  const backgroundColor = disabled
    ? palette.disabled
    : emphasized
      ? pressed ? '#C5D7F2' : hovered ? palette.palePressed : palette.pale
      : pressed
        ? source.pressed
        : hovered
          ? source.hover
          : source.background;
  const color = disabled
    ? palette.disabledText
    : emphasized
      ? palette.blue
      : pressed && source.pressedText
        ? source.pressedText
        : source.text;
  const borderColor = disabled
    ? '#A8B3C2'
    : emphasized
      ? palette.blue
      : source.border;
  return {
    container: {
      backgroundColor,
      borderColor,
      borderWidth: 1,
      outlineColor: focused ? palette.blue : 'transparent',
      outlineStyle: 'solid',
      outlineWidth: focused ? 3 : 0,
      outlineOffset: 3,
      opacity: 1,
    },
    label: { color, fontWeight: emphasized || variant === 'primary' ? '700' : '600' },
  };
}

export const surfaceStyles = Object.freeze({
  card: {
    borderRadius: radii.surface,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.white,
    boxShadow: '0 8px 24px #172b4d0d',
  },
  feature: {
    borderRadius: radii.surface,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderTopColor: palette.blue,
    borderTopWidth: 3,
    backgroundColor: palette.white,
    boxShadow: '0 8px 24px #172b4d0d',
  },
});
