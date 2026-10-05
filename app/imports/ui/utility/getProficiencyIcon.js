export default function getProficiencyIcon(proficiency){
  if (proficiency == 0.49){
    return 'mdi-brightness-3';
  } else if (proficiency == 0.5){
    return 'mdi-brightness-2';
  } else if (proficiency == 1) {
    return 'mdi-brightness-1'
  } else if (proficiency == 2){
    return 'mdi-album'
  } else {
    return 'mdi-radiobox-blank';
  }
}

/**
 * What a proficiency multiplier is, for its mark (ProficiencyIcon): proficient
 * (1), double (2), half rounded up (0.5) or down (0.49), or none
 */
export function proficiencyKind(proficiency) {
  switch (proficiency) {
    case 1: return 'proficient';
    case 2: return 'double';
    case 0.5: return 'halfUp';
    case 0.49: return 'halfDown';
    default: return undefined;
  }
}
