import { useTheme } from 'vuetify';
import { userSurfaceProps } from '/imports/ui/utility/userColor';

/**
 * userSurfaceProps for the current theme: `userSurface(color, colorProp)`
 * gives the props of a large surface in the user's colour, which follow the
 * theme as it changes
 */
export default function useUserSurface() {
  const theme = useTheme();
  return (color, colorProp = 'color') => userSurfaceProps(color, !!theme.current.value.dark, colorProp);
}
