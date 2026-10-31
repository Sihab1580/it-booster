/* =============================================================================
 *  SALES UPDATE — CONFIGURATION  (the ONLY file you need to edit routinely)
 *    • WINTER_SKUS       – fixed Winter SKU product codes.
 *    • WINTER_BASEPACKS  – Winter base pack codes. If a Closing Stock Extract is
 *                          uploaded, every Product Code under these base packs is
 *                          ALSO treated as Winter (catches house-specific SKU codes).
 *    • TDP_PERIODS, BU_ALIASES, TARGET_SHEET, SUPABASE_URL / SUPABASE_KEY.
 * ============================================================================= */
(function (root) {
  'use strict';
  const APP_VERSION = 'v2026.10.19-B';

  const WINTER_SKUS = [
    62693341, 62693771, 62722532, 62761679, 62770072, 64786088, 64823385, 64885693,
    64885755, 64941368, 64941369, 64969871, 64969872, 64969875, 64969876, 64969880,
    64969885, 64969893, 64969894, 64969896, 64969898, 64969899, 64969900, 64969901,
    64969904, 64969905, 64969906, 64969908, 64969910, 64969911, 64969916, 64969917,
    64969920, 64969923, 64969924, 64969925, 64969926, 64969927, 64969930, 64969931,
    64969933, 64969934, 64969935, 64969937, 64969938, 64969939, 64969940, 64969941,
    64969943, 64969945, 64969948, 64969950, 64969951, 64969952, 64969953, 64969957,
    64969960, 64969962, 64969971, 64969972, 64969975, 65251167, 65251169, 65251171,
    65255043, 65257003, 65257004, 65257005, 65257006, 65257007, 65278863, 65279534,
    65280349, 65448849, 65448852, 65452161, 65458231, 65458232, 65458233, 65458235,
    65458236, 65458238, 65633146, 65633148, 65694763, 65736793, 65736795, 65785963,
    65786027, 65786029, 65788137, 65791480, 66305661, 66306000, 66310608, 66310627,
    66310628, 66310629, 66310630, 66310631, 66310632, 66313363, 66318567, 66318572,
    66322757, 66322759, 66338301, 66338303, 66338491, 66338492, 66338493, 66338632,
    66338702, 66338742, 66338856, 66338858, 66338860, 66338862, 66338864, 68430032,
    68454848, 68454851, 68472602, 68734083, 68765114, 68765117, 68815521, 68815528,
    68815529, 68821993, 68831105, 69617167, 69622108, 69679080, 69679081, 69679092,
    69679094, 69679101, 69679107, 69679111, 69679114, 69679119, 69974621
  ];

  // ---- WINTER BASE PACK CODES (27) — matched against the Closing Stock Extract --
  const WINTER_BASEPACKS = [
    '7H3439022B2444605', '7H3439041B2AR3A04', '7H3439041B2AR3A05', '7H3440084B43E4402',
    '7H3440041B4BF3E01', '7H3440041B4BF3E02', '7H3440084B43EK714', '7H3440084B43EK702',
    '7H3440084B43EK701', '7H3440084B43EK811', '7H3440084B43EK802', '7H3440084B43EK801',
    '7H3440084B43EK707', '7H3440084B43EK807', '7H3439022B2444606', '7H3440084B43E4O01',
    '7H3440084B43E4P01', '7H3440084B43E4O02', '7H3440084B43E4P02', '7H3440084B43E4O03',
    '7H3440084B43E4P03', '7H3440084B43E4O04', '7H3440084B43E4P04', '7H3440084B43GA206',
    '7H3440084B43GA207', '7H3440084B43G0802', '7H3440084B43G5903'
  ];

  const COMPONENTS = ['Home Care', 'FOODS & ICE CREAM', 'PERSONAL CARE', 'BEAUTY & WELLBEING'];
  const BU_ORDER = ['FOODS & ICE CREAM', 'Home Care', 'Personal Care', 'Beauty & Wellbeing'];
  const BU_ALIASES = {
    'FOODS': 'FOODS & ICE CREAM', 'FOODS & ICE CREAM': 'FOODS & ICE CREAM',
    'HOME CARE': 'Home Care', 'PERSONAL CARE': 'Personal Care', 'BEAUTY & WELLBEING': 'Beauty & Wellbeing'
  };
  const TARGET_SHEET = 'Salesman BU Target Achievement ';
  const TDP_PERIODS = [
    { label: 'TDP 1',      fromDay: 1,  rawToDay: 10, targetKeys: ['t1'] },
    { label: 'TDP 2',      fromDay: 11, rawToDay: 20, targetKeys: ['t2'] },
    { label: 'TDP 3',      fromDay: 21, rawToDay: 31, targetKeys: ['t3'] },
    { label: 'TDP 1+2',    fromDay: 1,  rawToDay: 20, targetKeys: ['t1', 't2'] },
    { label: 'Full Month', fromDay: 1,  rawToDay: 31, targetKeys: ['t1', 't2', 't3'] }
  ];
  const DEFAULT_TDP = 'Full Month';
  const TDP_SUMMARY_ROWS = ['TDP 1', 'TDP 2', 'TDP 3', 'TDP 1+2', 'Full Month'];
  const DEFAULT_DATE_ORDER = 'DMY';
  // ---- BACKEND (Supabase) — accounts, app control and published reports ----------
  // The publishable key is MEANT to be public (it is safe inside a browser app). NEVER put the secret / service_role key here.
  const SUPABASE_URL = 'https://dpcgdvpaeiznyecorwgg.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Zd6mUxytEpemsB5P42CUtg_P8o0_nfB';

  const skuKey = (c) => String(c == null ? '' : c).trim().replace(/\.0+$/, '').replace(/^0+(?=\d)/, '').toUpperCase();
  root.APP_CONFIG = {
    APP_VERSION, WINTER_SKUS, WINTER_SKU_SET: new Set(WINTER_SKUS.map(skuKey)), WINTER_BASEPACKS, skuKey,
    COMPONENTS, BU_ORDER, BU_ALIASES, TARGET_SHEET,
    TDP_PERIODS, DEFAULT_TDP, TDP_SUMMARY_ROWS, DEFAULT_DATE_ORDER, SUPABASE_URL, SUPABASE_KEY
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.APP_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
