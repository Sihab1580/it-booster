/* =============================================================================
 *  SALES UPDATE — CLOSING STOCK PAGE  (reads File 4, the Closing Stock Extract)
 *
 *  RULES
 *   • Only Sound rows are used (Sound column auto-detected: column P /
 *     "Stock Type" / "Product Type").
 *   • Every Sound row is kept. The 8 mapped categories sit under their BU;
 *     any other category holding stock is listed too (tagged "no BU").
 *   • Closing Stock : Total PC = (Closing CS × Pack Size) + Closing PC
 *     In Transit    : Total PC = (PSI Intransit CS × Pack Size) + PSI Intransit PC
 *     Both          : Closing value + In Transit value
 *     Value         = Total PC × (LP Per PC | Trade Price Per PC)
 *   • Data travels inside the same encrypted town + PIN payload as the sales
 *     report, so no extra Firebase paths or rules are needed.
 * ============================================================================= */
(function (root) {
  'use strict';

  const ALIAS = {
    'stock date': 'd', 'distributor code': 'dc', 'category description': 'cat',
    'brand description': 'brand', 'product code': 'pcode', 'product description': 'pname',
    'pack size': 'pack', 'warehouse': 'wh', 'closing cs': 'cs', 'closing pc': 'pc',
    'psi intransit cs': 'psi_cs', 'psi intransit pc': 'psi_pc',
    'lp per pc': 'lp', 'trade price per pc': 'tp'
  };
  const REQUIRED = ['cat', 'brand', 'pcode', 'cs', 'pc'];
  const SOUND_COL_INDEX = 15;
  const SOUND_CANDIDATES = ['stock type', 'product type'];

  const BU_MAP = {
    'SKIN CARE': 'Beauty & Wellbeing', 'HAIR CARE': 'Beauty & Wellbeing',
    'SKIN CLEANSING': 'Personal Care', 'ORAL CARE': 'Personal Care',
    'HOME & HYGIENE': 'Home Care', 'FABRIC CLEANING': 'Home Care',
    'LIFESTYLE NUTRITION': 'Foods', 'COOKING AIDS': 'Foods'
  };
  const BU_LIST = ['Beauty & Wellbeing', 'Personal Care', 'Home Care', 'Foods'];
  const NOBU = '__NOBU__';
  // Icons are embedded (no icons/ folder needed, works offline)
  const BU_ICON = { 'Beauty & Wellbeing': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNlMDQ1N2IiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM5YjFkNWEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHBhdGggZD0iTTY0IDI2IEM3NCA0NiA5MiA1MiA5MiA3MiBhMjggMjggMCAwIDEgLTU2IDAgQzM2IDUyIDU0IDQ2IDY0IDI2eiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxwYXRoIGQ9Ik02NCA5OCBWNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNNjQgNzQgbDEyIC0xMCBNNjQgODQgbC0xMiAtMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=', 'Personal Care': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMxZjliZDciLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwYjVmYTUiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PGNpcmNsZSBjeD0iNjQiIGN5PSI0NCIgcj0iMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNMzYgOTggYzAgLTE4IDEyIC0zMCAyOCAtMzAgczI4IDEyIDI4IDMwIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PGNpcmNsZSBjeD0iOTYiIGN5PSIzNCIgcj0iNSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjMyIiBjeT0iMzgiIHI9IjMuNSIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==', 'Home Care': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyZmFlNWQiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMxMzdhM2MiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHBhdGggZD0iTTI4IDYyIEw2NCAzMiBMMTAwIDYyIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTM4IDU2IFY5NiBIOTAgVjU2IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTY0IDY2IGM2IDggMTAgMTIgMTAgMTggYTEwIDEwIDAgMCAxIC0yMCAwIGMwIC02IDQgLTEwIDEwIC0xOHoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=', 'Foods': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNmMzlhMWUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNjODU4MGIiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHBhdGggZD0iTTMwIDY2IEg5OCBhMzQgMzAgMCAwIDEgLTY4IDB6IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTUwIDU2IGMtNCAtOCA0IC0xMiAwIC0yMCBNNjQgNTYgYy00IC04IDQgLTEyIDAgLTIwIE03OCA1NiBjLTQgLTggNCAtMTIgMCAtMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNNTAgMTAwIEg3OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==' };
  const CAT_ICON = {
    'SKIN CARE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNmMDZlYTAiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNjMTNhNzQiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHJlY3QgeD0iNDQiIHk9IjUyIiB3aWR0aD0iNDAiIGhlaWdodD0iNDYiIHJ4PSIxMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxyZWN0IHg9IjUyIiB5PSIzNiIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE2IiByeD0iNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxwYXRoIGQ9Ik01NCA3NCBoMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=', 'HAIR CARE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNhMTVjZDYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM2YjJmYTMiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHBhdGggZD0iTTQwIDMwIGMtNiAyNCA2IDQwIDAgNjggTTU2IDMwIGMtNiAyNCA2IDQwIDAgNjggTTcyIDMwIGMtNiAyNCA2IDQwIDAgNjggTTg4IDMwIGMtNiAyNCA2IDQwIDAgNjgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=',
    'SKIN CLEANSING': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyYmIzYzkiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMxNDdmOTYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHJlY3QgeD0iMzAiIHk9IjU4IiB3aWR0aD0iNTgiIGhlaWdodD0iMzQiIHJ4PSIxNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjgyIiBjeT0iNDAiIHI9IjkiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48Y2lyY2xlIGN4PSI5OCIgY3k9IjU4IiByPSI2IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PGNpcmNsZSBjeD0iNjYiIGN5PSIzNCIgcj0iNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==', 'ORAL CARE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMzZDdiZTAiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMxYjRlYTgiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHBhdGggZD0iTTQyIDM0IGMxMCAtNiAxOCAyIDIyIDIgczEyIC04IDIyIC0yIGMxMCA4IDQgMjYgMCAzNCBjLTQgMTAgLTQgMzAgLTEwIDMwIHMtNiAtMjAgLTEyIC0yMCBzLTYgMjAgLTEyIDIwIHMtNiAtMjAgLTEwIC0zMCBjLTQgLTggLTEwIC0yNiAwIC0zNHoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=',
    'HOME & HYGIENE': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyNWE1NmIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwZjczNDYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHBhdGggZD0iTTY0IDI4IEw5MiA0MCBWNjQgYzAgMTggLTEyIDMwIC0yOCAzNiBjLTE2IC02IC0yOCAtMTggLTI4IC0zNiBWNDB6IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTUwIDY0IGwxMCAxMCBsMTggLTIwIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+', 'FABRIC CLEANING': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM0YTkwZTIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMyMzU3YTgiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHBhdGggZD0iTTQ0IDMwIEwzMCA0NCBMNDAgNTQgTDQ2IDUwIFY5OCBIODIgVjUwIEw4OCA1NCBMOTggNDQgTDg0IDMwIGMtNCA4IC0xMCAxMCAtMjAgMTAgcy0xNiAtMiAtMjAgLTEweiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==',
    'LIFESTYLE NUTRITION': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNmMmIwMWUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNjNDdhMDYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHBhdGggZD0iTTUwIDMwIGgyOCBNNTQgMzAgdjEyIGwtMTIgMTggdjMyIGE2IDYgMCAwIDAgNiA2IGgzMiBhNiA2IDAgMCAwIDYgLTYgdi0zMiBsLTEyIC0xOCB2LTEyIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTQ0IDc0IGg0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==', 'COOKING AIDS': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNlODYyMmMiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiMTNhMTAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI4IiBmaWxsPSJ1cmwoI2cpIi8+PHBhdGggZD0iTTMwIDYwIEg5MCBWODIgYTE2IDE2IDAgMCAxIC0xNiAxNiBINDYgYTE2IDE2IDAgMCAxIC0xNiAtMTZ6IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTkwIDY2IEgxMDIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNNDggNTAgYy00IC02IDQgLTEwIDAgLTE2IE02MiA1MCBjLTQgLTYgNCAtMTAgMCAtMTYgTTc2IDUwIGMtNCAtNiA0IC0xMCAwIC0xNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg=='
  };
  const BU_COLOR = { 'Beauty & Wellbeing': '#e85d9c', 'Personal Care': '#1e90c9', 'Home Care': '#2ea043', 'Foods': '#f4a100', NoBU: '#7c4dff' };
  const PALETTE = ['#1F36C7', '#2f6fed', '#00a99d', '#f4a100', '#e63946', '#7c4dff', '#ff7043', '#26a69a', '#ab47bc', '#5c6bc0', '#8d6e63', '#2ea043', '#e85d9c', '#1e90c9'];
  const LOC_LABEL = { closing: 'Closing Stock', transit: 'In Transit', both: 'Closing + In Transit' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fN = (n) => Math.round(n).toLocaleString('en-IN');
  const fM = (n) => '৳ ' + Math.round(n).toLocaleString('en-IN');
  const fC = (n) => { const s = n < 0 ? '-' : ''; n = Math.abs(n); return s + (n >= 1e7 ? (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? (n / 1e5).toFixed(2) + ' L' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n)); };
  const cleanKey = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim().toUpperCase();
  const title = (s) => String(s).toLowerCase().replace(/(^|\s|&\s|\/)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const brandColor = (n) => { let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const isSound = (v) => String(v == null ? '' : v).toLowerCase().includes('sound');
  const serialToIso = (n) => new Date(Math.floor(n - 25569) * 86400000).toISOString().slice(0, 10);
  const fmtIso = (d) => { if (!d) return '—'; const x = new Date(d + 'T00:00:00'); return isNaN(x) ? d : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };

  /* ------------------------------- parsing -------------------------------- */
  function parseWorkbook(XLSX, wb) {
    let sheet = null, json = null;
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn], j = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
      if (!j.length) continue;
      const hits = Object.keys(j[0]).map((k) => ALIAS[k.trim().toLowerCase()]).filter(Boolean);
      if (REQUIRED.every((r) => hits.includes(r))) { sheet = ws; json = j; break; }
    }
    if (!json) throw new Error('No sheet with Category / Brand / Product Code / Closing CS / Closing PC columns was found.');

    const header = (XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0 })[0]) || [];
    const keys = Object.keys(json[0]), sample = json.slice(0, 800);
    const hasSound = (k) => sample.some((r) => isSound(r[k]));
    let soundCol = null;
    const atP = header[SOUND_COL_INDEX] != null ? String(header[SOUND_COL_INDEX]) : null;
    if (atP && keys.includes(atP) && hasSound(atP)) soundCol = atP;
    if (!soundCol) for (const c of SOUND_CANDIDATES) { const k = keys.find((x) => x.trim().toLowerCase() === c); if (k && hasSound(k)) { soundCol = k; break; } }
    if (!soundCol) throw new Error('No column containing "Sound" was found (checked column P, "Stock Type", "Product Type").');

    const sound = json.filter((r) => isSound(r[soundCol]));
    const rows = sound.map((raw) => {
      const r = {};
      for (const k in raw) { const a = ALIAS[k.trim().toLowerCase()]; if (a) r[a] = raw[k]; }
      let d = r.d;
      if (typeof d === 'number') d = serialToIso(d);
      else if (d instanceof Date) d = d.toISOString().slice(0, 10);
      const cat = cleanKey(r.cat) || 'UNSPECIFIED';
      return {
        d: d ? String(d).slice(0, 10).trim() : '', dc: r.dc != null ? String(r.dc).trim().replace(/\.0+$/, '') : '',
        cat, brand: cleanKey(r.brand) || 'UNSPECIFIED', pcode: r.pcode != null ? String(r.pcode).trim() : '',
        pname: String(r.pname || '').trim(), pack: Number(r.pack) || 1, wh: String(r.wh || '').trim(),
        cs: Number(r.cs) || 0, pc: Number(r.pc) || 0, psi_cs: Number(r.psi_cs) || 0, psi_pc: Number(r.psi_pc) || 0,
        lp: Number(r.lp) || 0, tp: Number(r.tp) || 0
      };
    });
    const byCat = {};
    rows.forEach((r) => { byCat[r.cat] = (byCat[r.cat] || 0) + 1; });
    const dates = Array.from(new Set(rows.map((r) => r.d).filter(Boolean))).sort();
    const dcs = Array.from(new Set(rows.map((r) => r.dc).filter(Boolean)));
    return { rows, stats: { totalRows: json.length, soundRows: sound.length, nonSound: json.length - sound.length, soundCol, byCat, date: dates[dates.length - 1] || '', dcs } };
  }

  /* ------------------------------ computation ----------------------------- */
  function compute(r) {
    const price = st.price === 'TP' ? r.tp : r.lp;
    const clPcs = r.cs * r.pack + r.pc, trPcs = r.psi_cs * r.pack + r.psi_pc;
    let cs, pc, pieces;
    if (st.loc === 'transit') { cs = r.psi_cs; pc = r.psi_pc; pieces = trPcs; }
    else if (st.loc === 'both') { cs = r.cs + r.psi_cs; pc = r.pc + r.psi_pc; pieces = clPcs + trPcs; }
    else { cs = r.cs; pc = r.pc; pieces = clPcs; }
    return { ...r, bu: BU_MAP[r.cat] || null, cs, pc, pieces, price, val: pieces * price };
  }
  const sum = (rows) => rows.reduce((s, r) => { s.cs += r.cs; s.pc += r.pc; s.pieces += r.pieces; s.val += r.val; return s; }, { cs: 0, pc: 0, pieces: 0, val: 0 });
  function group(rows, fn) {
    const m = new Map();
    rows.forEach((r) => { const k = fn(r); if (!m.has(k)) m.set(k, { cs: 0, pc: 0, pieces: 0, val: 0 }); const g = m.get(k); g.cs += r.cs; g.pc += r.pc; g.pieces += r.pieces; g.val += r.val; });
    return m;
  }
  const all = () => (st.data ? st.data.rows.map(compute) : []);
  function noBuCats(rows) {
    return Array.from(group(rows.filter((r) => !r.bu), (r) => r.cat).entries())
      .filter(([, v]) => v.pieces > 0 || v.val > 0).sort((a, b) => b[1].val - a[1].val).map(([c]) => c);
  }
  function scopeRows() {
    let rows = all();
    const nb = new Set(noBuCats(rows));
    if (st.cat !== 'All') rows = rows.filter((r) => r.cat === st.cat);
    else if (st.bu === NOBU) rows = rows.filter((r) => !r.bu && nb.has(r.cat));
    else if (st.bu !== 'All') rows = rows.filter((r) => r.bu === st.bu);
    else rows = rows.filter((r) => r.bu);
    if (st.brand !== 'All') rows = rows.filter((r) => r.brand === st.brand);
    if (st.search) { const s = st.search.toLowerCase(); rows = rows.filter((r) => r.pname.toLowerCase().includes(s) || r.pcode.toLowerCase().includes(s) || r.brand.toLowerCase().includes(s)); }
    return rows;
  }
  const skuRows = () => { const r = scopeRows(); return st.zeroOnly ? r.filter((x) => x.pieces === 0) : r; };

  /* -------------------------------- state --------------------------------- */
  const st = { data: null, err: null, label: '', loc: 'closing', price: 'LP', bu: 'All', cat: 'All', brand: 'All', search: '', zeroOnly: false, sort: { key: 'val', dir: 'desc' }, page: 1, size: 50, chart: null };

  function setData(data, opts) {
    opts = opts || {};
    st.data = data && data.rows && data.rows.length ? data : null;
    st.err = opts.error || null;
    st.label = opts.label || '';
    Object.assign(st, { bu: 'All', cat: 'All', brand: 'All', search: '', zeroOnly: false, page: 1 });
    if ($('sdSearch')) $('sdSearch').value = '';
    render();
  }

  /* ------------------------------- rendering ------------------------------ */
  function nameCell(type, key) {
    if (type === 'bu') {
      if (key === NOBU) return `<span class="sd-name"><span class="sd-sw" style="background:${BU_COLOR.NoBU}">◇</span>Categories with no BU</span>`;
      return `<span class="sd-name"><img src="${BU_ICON[key]}" alt="">${esc(key)}</span>`;
    }
    if (type === 'cat') {
      if (CAT_ICON[key]) return `<span class="sd-name"><img src="${CAT_ICON[key]}" alt="">${esc(title(key))}</span>`;
      return `<span class="sd-name"><span class="sd-sw" style="background:${BU_COLOR.NoBU}">${initials(key)}</span>${esc(title(key))}<span class="sd-nobu">no BU</span></span>`;
    }
    return `<span class="sd-name"><span class="sd-sw" style="background:${brandColor(key)}">${initials(key)}</span>${esc(title(key))}</span>`;
  }
  const rowHtml = (type, key, g, sel, cls) => `<tr class="sd-click${sel ? ' sel' : ''} ${cls || ''}" data-key="${esc(key)}"><td>${nameCell(type, key)}</td><td class="n">${fN(g.cs)}</td><td class="n">${fN(g.pc)}</td><td class="n">${fN(g.pieces)}</td><td class="n sd-val">${fM(g.val)}</td></tr>`;
  const totHtml = (label, g) => `<tr class="sd-tot"><td>${esc(label)}</td><td class="n">${fN(g.cs)}</td><td class="n">${fN(g.pc)}</td><td class="n">${fN(g.pieces)}</td><td class="n sd-val">${fM(g.val)}</td></tr>`;
  const Z = { cs: 0, pc: 0, pieces: 0, val: 0 };

  function render() {
    if (!$('pageStock')) return;
    const has = !!st.data;
    $('sdBody').classList.toggle('hidden', !has);
    $('sdEmpty').classList.toggle('hidden', has);
    if (!has) {
      $('sdEmpty').innerHTML = st.err
        ? `<b>Closing Stock Extract could not be read.</b> ${esc(st.err)}`
        : 'No Closing Stock Extract in this report. Upload <b>File 4 — Closing Stock Extract</b> and publish again to see the closing stock page.';
      return;
    }
    const A = all(), nb = noBuCats(A);
    const s = st.data.stats;
    $('sdHead').innerHTML = `${st.label ? '<b>' + esc(st.label) + '</b> · ' : ''}Distributor ${esc(s.dcs.join(', ') || '—')} · Stock as of <b>${fmtIso(s.date)}</b>`;

    // toggles + chips
    document.querySelectorAll('#sdLoc .sd-tg').forEach((b) => b.classList.toggle('on', b.dataset.v === st.loc));
    document.querySelectorAll('#sdPrice .sd-tg').forEach((b) => b.classList.toggle('on', b.dataset.v === st.price));
    const nNoBu = A.filter((r) => !r.bu && nb.includes(r.cat)).length;
    $('sdChips').innerHTML = `<button class="sd-chip${st.bu === 'All' && st.cat === 'All' ? ' on' : ''}" data-bu="All">All Business Units</button>` +
      BU_LIST.map((b) => `<button class="sd-chip${st.bu === b ? ' on' : ''}" data-bu="${esc(b)}"><img src="${BU_ICON[b]}" alt="">${esc(b)}</button>`).join('') +
      (nNoBu ? `<button class="sd-chip nobu${st.bu === NOBU ? ' on' : ''}" data-bu="${NOBU}">◇ No BU categories (${nb.length})</button>` : '');
    document.querySelectorAll('#sdChips .sd-chip').forEach((c) => c.onclick = () => { st.bu = c.dataset.bu; st.cat = 'All'; st.brand = 'All'; st.page = 1; render(); if (st.bu !== 'All') jumpTo('sdCat'); });

    // scope
    const crumbs = [];
    if (st.bu === NOBU) crumbs.push('No BU categories'); else if (st.bu !== 'All') crumbs.push(st.bu);
    if (st.cat !== 'All') crumbs.push(title(st.cat) + (BU_MAP[st.cat] ? '' : ' (no BU)'));
    if (st.brand !== 'All') crumbs.push(title(st.brand));
    if (st.zeroOnly) crumbs.push('Zero-stock SKUs only');
    $('sdScope').classList.toggle('hidden', !crumbs.length);
    $('sdCrumbs').innerHTML = crumbs.map((c) => `<b>${esc(c)}</b>`).join(' › ');

    // KPIs
    const S = scopeRows(), t = sum(S), zero = new Set(S.filter((r) => r.pieces === 0).map((r) => r.pcode)).size;
    const pl = st.price === 'TP' ? 'Trade Price Per PC' : 'LP Per PC';
    $('sdKpis').innerHTML = [
      ['Total Value', fM(t.val), fC(t.val) + ' · ' + pl], ['Total PC', fN(t.pieces), LOC_LABEL[st.loc]],
      ['CS / PC', fN(t.cs) + ' CS', fN(t.pc) + ' PC'], ['SKUs in scope', fN(new Set(S.map((r) => r.pcode)).size), fN(S.length) + ' rows'],
      ['Zero-stock SKUs', fN(zero), 'in current selection']
    ].map(([k, v, sub], i) => `<div class="stat${i === 4 ? ' warnc' : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="sd-sub">${sub}</div></div>`).join('');

    // BU table
    const ul = A.filter((r) => r.bu), nbr = A.filter((r) => !r.bu && nb.includes(r.cat)), gBU = group(ul, (r) => r.bu);
    let h = BU_LIST.map((b) => rowHtml('bu', b, gBU.get(b) || Z, st.bu === b)).join('') + totHtml('Grand Total (Unilever BUs only)', sum(ul));
    if (nbr.length) h += rowHtml('bu', NOBU, sum(nbr), st.bu === NOBU, 'sd-dim') + totHtml('Grand Total (ALL categories)', sum(ul.concat(nbr)));
    $('sdBU').tBodies[0].innerHTML = h;
    $('sdBU').querySelectorAll('.sd-click').forEach((tr) => tr.onclick = () => { st.bu = tr.dataset.key; st.cat = 'All'; st.brand = 'All'; st.page = 1; render(); jumpTo('sdCat'); });

    // Category table
    let cRows, buCats, extra = [], hint;
    if (st.bu === NOBU) { cRows = nbr; buCats = []; extra = nb; hint = 'Categories with no BU that hold stock'; }
    else if (st.bu !== 'All') { cRows = A.filter((r) => r.bu === st.bu); buCats = Object.keys(BU_MAP).filter((c) => BU_MAP[c] === st.bu); hint = st.bu; }
    else { cRows = ul.concat(nbr); buCats = Object.keys(BU_MAP); extra = nb; hint = nb.length ? `All Business Units + ${nb.length} with no BU` : 'All Business Units'; }
    $('sdCatHint').textContent = 'Scope: ' + hint;
    const gC = group(cRows, (r) => r.cat);
    $('sdCat').tBodies[0].innerHTML = buCats.map((c) => rowHtml('cat', c, gC.get(c) || Z, st.cat === c)).join('') +
      extra.map((c) => rowHtml('cat', c, gC.get(c) || Z, st.cat === c, 'sd-dim')).join('') + totHtml('Subtotal', sum(cRows));
    $('sdCat').querySelectorAll('.sd-click').forEach((tr) => tr.onclick = () => { st.cat = tr.dataset.key; st.brand = 'All'; st.page = 1; render(); jumpTo('sdBrand'); });

    // Brand table
    let bRows;
    if (st.cat !== 'All') bRows = A.filter((r) => r.cat === st.cat);
    else if (st.bu === NOBU) bRows = nbr;
    else if (st.bu !== 'All') bRows = A.filter((r) => r.bu === st.bu);
    else bRows = ul;
    $('sdBrandHint').textContent = 'Scope: ' + [st.bu === NOBU ? 'No BU categories' : (st.bu !== 'All' ? st.bu : 'All Business Units'), st.cat !== 'All' ? title(st.cat) : null].filter(Boolean).join(' ▸ ');
    const gB = group(bRows, (r) => r.brand), brands = Array.from(gB.keys()).sort((a, b) => gB.get(b).val - gB.get(a).val);
    $('sdBrand').tBodies[0].innerHTML = (brands.map((b) => rowHtml('brand', b, gB.get(b), st.brand === b)).join('') || '<tr><td colspan="5" class="empty">No brands in this scope.</td></tr>') + totHtml('Subtotal', sum(bRows));
    $('sdBrand').querySelectorAll('.sd-click').forEach((tr) => tr.onclick = () => { st.brand = tr.dataset.key; st.page = 1; render(); jumpTo('sdSku'); });

    renderChart(ul, nbr);
    renderSku();

    // zero banner
    const zRows = S.filter((r) => r.pieces === 0), zc = new Set(zRows.map((r) => r.pcode)).size;
    $('sdZero').classList.toggle('hidden', !zc);
    if (zc) {
      const byB = {}; zRows.forEach((r) => { byB[r.brand] = (byB[r.brand] || 0) + 1; });
      const top = Object.entries(byB).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, n]) => `${title(b)} (${n})`).join(', ');
      $('sdZeroTxt').innerHTML = `<b>${fN(zc)}</b> SKUs have <b>zero stock</b> in the current selection. Most affected: ${esc(top)}.`;
      $('sdZeroBtn').textContent = st.zeroOnly ? '✕ Show all SKUs' : 'View zero-stock list ↑';
    }

    // import summary
    const noBuN = st.data.rows.filter((r) => !BU_MAP[r.cat]).length;
    $('sdImport').innerHTML = `Read <b>${fN(s.totalRows)}</b> rows · kept <b>${fN(s.soundRows)}</b> Sound rows (excluded ${fN(s.nonSound)} non-Sound via "${esc(s.soundCol)}")` +
      (noBuN ? ` · <b>${fN(noBuN)}</b> row(s) in categories with no BU.` : '.');
    $('sdImportDetails').innerHTML = '<table class="pv"><tbody>' + Object.entries(s.byCat).sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `<tr><td>${esc(title(c))} <span class="muted">(${esc(BU_MAP[c] || 'no BU')})</span></td><td class="n">${fN(n)}</td></tr>`).join('') + '</tbody></table>';
  }

  function renderChart(ul, nbr) {
    if (typeof Chart === 'undefined' || !$('sdChart')) return;
    const g = group(ul, (r) => r.bu), labels = [], data = [], colors = [];
    BU_LIST.forEach((b) => { const v = (g.get(b) || Z).val; if (v > 0) { labels.push(b); data.push(v); colors.push(BU_COLOR[b]); } });
    const nv = sum(nbr).val; if (nv > 0) { labels.push('No BU categories'); data.push(nv); colors.push(BU_COLOR.NoBU); }
    $('sdChartHint').textContent = `${LOC_LABEL[st.loc]} · ${st.price === 'TP' ? 'Trade Price Per PC' : 'LP Per PC'}`;
    if (st.chart) st.chart.destroy();
    st.chart = new Chart($('sdChart'), {
      type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${fM(c.parsed)}` } } } }
    });
  }

  function renderSku() {
    const rows = skuRows().sort((a, b) => {
      const k = st.sort.key, d = st.sort.dir === 'asc' ? 1 : -1;
      return typeof a[k] === 'string' ? a[k].localeCompare(b[k]) * d : ((a[k] || 0) - (b[k] || 0)) * d;
    });
    $('sdSkuCount').textContent = fN(new Set(rows.map((r) => r.pcode)).size) + (st.zeroOnly ? ' zero-stock' : '');
    const pages = Math.max(1, Math.ceil(rows.length / st.size));
    if (st.page > pages) st.page = pages;
    const pg = rows.slice((st.page - 1) * st.size, st.page * st.size);
    $('sdSku').tBodies[0].innerHTML = pg.map((r) => `<tr class="${r.pieces === 0 ? 'sd-zero' : ''}"><td>${esc(title(r.cat))}${r.bu ? '' : '<span class="sd-nobu">no BU</span>'}</td><td>${esc(title(r.brand))}</td>` +
      `<td title="${esc(r.pname)}">${esc(r.pname.length > 44 ? r.pname.slice(0, 44) + '…' : r.pname)}</td><td class="n">${r.pack}</td>` +
      `<td class="n">${fN(r.cs)}</td><td class="n">${fN(r.pc)}</td><td class="n">${fN(r.pieces)}</td><td class="n">${r.price.toFixed(2)}</td><td class="n sd-val">${fM(r.val)}</td></tr>`).join('')
      || `<tr><td colspan="9" class="empty">${st.zeroOnly ? 'No zero-stock SKUs in this selection.' : 'No rows match the current selection.'}</td></tr>`;
    $('sdPageInfo').textContent = `Page ${st.page} / ${pages}`;
    $('sdPrev').disabled = st.page <= 1; $('sdNext').disabled = st.page >= pages;
    $('sdZeroOnly').checked = st.zeroOnly;
    document.querySelectorAll('#sdSku th[data-k]').forEach((th) => {
      th.textContent = th.textContent.replace(/ [▲▼]$/, '');
      if (th.dataset.k === st.sort.key) th.textContent += st.sort.dir === 'asc' ? ' ▲' : ' ▼';
    });
  }

  function exportXlsx() {
    if (!st.data || typeof XLSX === 'undefined') return;
    const aoa = [['Category', 'Business Unit', 'Brand', 'Product Code', 'Product', 'Pack Size', 'CS', 'PC', 'Total PC', `Price Per PC (${st.price})`, 'Value']];
    skuRows().forEach((r) => aoa.push([title(r.cat), r.bu || 'No BU', title(r.brand), r.pcode, r.pname, r.pack, r.cs, r.pc, r.pieces, +r.price.toFixed(2), +r.val.toFixed(2)]));
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 44 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Closing Stock');
    const tag = { closing: 'Closing', transit: 'InTransit', both: 'Both' }[st.loc];
    XLSX.writeFile(wb, `Closing_Stock_${(st.label || 'Town').replace(/[^A-Za-z0-9]+/g, '_')}_${st.data.stats.date}_${tag}_${st.price}${st.zeroOnly ? '_ZERO' : ''}.xlsx`);
  }

  // After a click, bring the next level into view (heading just below the sticky top bar)
  function jumpTo(tableId) {
    const t = $(tableId); if (!t) return;
    const wrap = t.closest('.table-wrap'), head = wrap && wrap.previousElementSibling;
    const el = head || wrap || t;
    requestAnimationFrame(() => {
      const y = el.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top: Math.max(y, 0), behavior: 'smooth' });
      if (wrap) wrap.scrollTop = 0;
    });
  }
  function clearSel() { Object.assign(st, { bu: 'All', cat: 'All', brand: 'All', search: '', zeroOnly: false, page: 1 }); $('sdSearch').value = ''; render(); }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('pageStock')) return;
    document.querySelectorAll('#sdLoc .sd-tg').forEach((b) => b.onclick = () => { st.loc = b.dataset.v; st.page = 1; render(); });
    document.querySelectorAll('#sdPrice .sd-tg').forEach((b) => b.onclick = () => { st.price = b.dataset.v; render(); });
    $('sdClear').onclick = clearSel; $('sdScopeClear').onclick = clearSel;
    $('sdSearch').oninput = (e) => { st.search = e.target.value; st.page = 1; render(); };
    $('sdZeroOnly').onchange = (e) => { st.zeroOnly = e.target.checked; st.page = 1; render(); };
    $('sdZeroBtn').onclick = () => { st.zeroOnly = !st.zeroOnly; st.page = 1; render(); if (st.zeroOnly) $('sdSkuCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $('sdPrev').onclick = () => { st.page--; renderSku(); };
    $('sdNext').onclick = () => { st.page++; renderSku(); };
    $('sdExport').onclick = exportXlsx;
    $('sdImportToggle').onclick = () => { const d = $('sdImportDetails'); d.classList.toggle('hidden'); $('sdImportToggle').textContent = d.classList.contains('hidden') ? 'Show details' : 'Hide details'; };
    document.querySelectorAll('#sdSku th[data-k]').forEach((th) => th.onclick = () => {
      const k = th.dataset.k;
      if (st.sort.key === k) st.sort.dir = st.sort.dir === 'asc' ? 'desc' : 'asc'; else { st.sort.key = k; st.sort.dir = 'desc'; }
      renderSku();
    });
    render();
  });

  root.STOCKDASH = { parseWorkbook, setData, render, hasData: () => !!st.data, _state: st, _scopeRows: scopeRows, _all: all, _sum: sum };
})(window);
