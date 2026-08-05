// Word pools for the boards. Chosen so yes/no questions actually narrow things
// down: living vs made, indoors vs outdoors, edible, moves, size, etc.
//
// Each pool is a self-contained set — a room draws its whole rack from one of
// them, so the two players always share a language.

const EN = [
  // animals
  'ELEPHANT', 'PENGUIN', 'OCTOPUS', 'SPIDER', 'DOLPHIN', 'CAMEL',
  'FALCON', 'TORTOISE', 'WOLF', 'BUTTERFLY', 'CROCODILE', 'HAMSTER',
  'JELLYFISH', 'OSTRICH', 'BEAVER', 'SCORPION', 'PARROT', 'SNAIL',
  // food & drink
  'PIZZA', 'AVOCADO', 'PANCAKE', 'COFFEE', 'WATERMELON', 'CHEESE',
  'NOODLES', 'CHOCOLATE', 'POPCORN', 'HONEY', 'PICKLE', 'CROISSANT',
  'SUSHI', 'PEANUT', 'YOGURT', 'CINNAMON',
  // household objects
  'TOOTHBRUSH', 'UMBRELLA', 'MIRROR', 'LADDER', 'CANDLE', 'PILLOW',
  'SCISSORS', 'KETTLE', 'BROOM', 'BLANKET', 'STAPLER', 'DOORBELL',
  'MAGNET', 'SPONGE', 'ZIPPER', 'BUTTON',
  // tech & tools
  'KEYBOARD', 'TELESCOPE', 'BATTERY', 'DRONE', 'HEADPHONES', 'MICROWAVE',
  'HAMMER', 'PRINTER', 'FLASHLIGHT', 'SATELLITE', 'ROBOT', 'CAMERA',
  // vehicles
  'SUBMARINE', 'BICYCLE', 'HELICOPTER', 'TRACTOR', 'SKATEBOARD', 'AMBULANCE',
  'ROCKET', 'CANOE', 'TRAIN', 'HOT AIR BALLOON',
  // places
  'LIBRARY', 'VOLCANO', 'AIRPORT', 'DESERT', 'CASTLE', 'HOSPITAL',
  'GLACIER', 'STADIUM', 'CAVE', 'LIGHTHOUSE', 'MARKET', 'SWAMP',
  // nature
  'THUNDER', 'RAINBOW', 'CACTUS', 'WATERFALL', 'MUSHROOM', 'SNOWFLAKE',
  'CORAL', 'TORNADO', 'BAMBOO', 'FOSSIL',
  // clothing & wearables
  'SNEAKERS', 'SCARF', 'HELMET', 'GLOVES', 'SUNGLASSES', 'WATCH',
  // music & play
  'VIOLIN', 'DRUM', 'PUZZLE', 'KITE', 'BALLOON', 'CHESS',
  'TRUMPET', 'MARBLE', 'YO-YO', 'DOMINO',
  // misc concepts that are still guessable
  'SHADOW', 'ECHO', 'MAP', 'KEY', 'LADYBUG', 'ANCHOR',
  'COMPASS', 'FEATHER', 'CROWN', 'BUBBLE',
];

// Deliberately avoids near-identical pairs that differ by a single dot or a
// trailing letter — نحلة/نخلة, سحاب/سحابة, مروحة/مروحية — since two of those on
// one rack is a misread rather than a deduction.
const AR = [
  // حيوانات
  'فيل', 'بطريق', 'أخطبوط', 'عنكبوت', 'دلفين', 'جمل',
  'صقر', 'سلحفاة', 'ذئب', 'فراشة', 'تمساح', 'قنفذ',
  'نعامة', 'عقرب', 'ببغاء', 'حلزون', 'أسد', 'نحلة',
  'غزال', 'خفاش',
  // طعام وشراب
  'بيتزا', 'أفوكادو', 'قهوة', 'بطيخ', 'جبن', 'معكرونة',
  'شوكولاتة', 'فشار', 'عسل', 'مخلل', 'كرواسون', 'سوشي',
  'زبادي', 'قرفة', 'تمر', 'زيتون', 'خبز', 'أرز',
  'ليمون', 'فراولة',
  // أدوات منزلية
  'مظلة', 'مرآة', 'سلم', 'شمعة', 'وسادة', 'مقص',
  'إبريق', 'مكنسة', 'بطانية', 'دباسة', 'جرس', 'مغناطيس',
  'إسفنجة', 'سحاب', 'زر', 'مفتاح', 'صابون', 'ملعقة',
  'مشط', 'مكواة',
  // تقنية وأدوات
  'تلسكوب', 'بطارية', 'سماعات', 'ميكروويف', 'مطرقة', 'طابعة',
  'كشاف', 'روبوت', 'كاميرا', 'حاسوب', 'هاتف', 'ساعة',
  // مركبات
  'غواصة', 'دراجة', 'مروحية', 'جرار', 'إسعاف', 'صاروخ',
  'قارب', 'قطار', 'منطاد', 'حافلة', 'سفينة', 'سيارة',
  // أماكن
  'مكتبة', 'بركان', 'مطار', 'صحراء', 'قلعة', 'مستشفى',
  'ملعب', 'كهف', 'منارة', 'سوق', 'مسجد', 'جسر',
  'حديقة', 'متحف',
  // طبيعة
  'رعد', 'قوس قزح', 'صبار', 'شلال', 'فطر', 'ثلج',
  'مرجان', 'إعصار', 'أحفورة', 'قمر', 'نجمة', 'رمل',
  'غيمة', 'زهرة',
  // ملابس
  'حذاء', 'وشاح', 'خوذة', 'قفازات', 'نظارة', 'قبعة', 'حزام',
  // موسيقى ولعب
  'كمان', 'طبل', 'أحجية', 'بالون', 'شطرنج', 'بوق',
  'عود', 'نرد', 'دومينو', 'طائرة ورقية',
  // متفرقات
  'ظل', 'صدى', 'خريطة', 'دعسوقة', 'مرساة', 'بوصلة',
  'ريشة', 'تاج', 'فقاعة', 'خاتم',
];

export const WORD_SETS = {
  en: { words: EN, dir: 'ltr' },
  ar: { words: AR, dir: 'rtl' },
};

export const LANGUAGES = Object.keys(WORD_SETS);
export const DEFAULT_LANGUAGE = 'en';
