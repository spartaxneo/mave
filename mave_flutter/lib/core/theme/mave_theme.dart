import 'package:flutter/material.dart';

/// MAVE Design System & Hallmark Anti-Slop Palette
/// High-contrast surfaces, emerald accent, hairline borders, and tactile spring curves.
class MaveTheme {
  // Backgrounds & Surfaces
  static const Color bg = Color(0xFF212121);
  static const Color sidebarBg = Color(0xFF171717);
  static const Color surface1 = Color(0xFF171717);
  static const Color surface2 = Color(0xFF2F2F2F);
  static const Color surface3 = Color(0xFF383838);
  static const Color surface4 = Color(0xFF424242);

  // Hairline & Subtle Borders
  static const Color borderSubtle = Color(0x1FFFFFFF); // 12% white
  static const Color borderStrong = Color(0x33FFFFFF); // 20% white
  static const Color hairline = Color(0x14FFFFFF);     // 8% white

  // Typography
  static const Color text1 = Color(0xFFECECEC);
  static const Color text2 = Color(0xFFB4B4B4);
  static const Color text3 = Color(0xFF8E8E8E);

  // Accents & Signals
  static const Color accent = Color(0xFF10A37F); // Emerald Green
  static const Color accentHover = Color(0xFF1A7F64);
  static const Color accentSubtle = Color(0x2610A37F);
  static const Color buddy = Color(0xFF10A37F);

  static const Color danger = Color(0xFFEF4444);
  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);
  static const Color info = Color(0xFF3B82F6);

  // Corner Radii
  static const double rSm = 6.0;
  static const double rMd = 8.0;
  static const double rLg = 12.0;
  static const double rXl = 16.0;
  static const double rPill = 999.0;

  // Tactile Apple-Design Animation Durations & Springs
  static const Duration fast = Duration(milliseconds: 140);
  static const Duration normal = Duration(milliseconds: 220);
  static const Duration spring = Duration(milliseconds: 320);
  static const Curve springCurve = Cubic(0.22, 1.0, 0.36, 1.0);
  static const double touchDownScale = 0.97;

  // Dark Theme Data
  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bg,
      fontFamily: 'Inter',
      colorScheme: const ColorScheme.dark(
        primary: accent,
        surface: surface1,
        onSurface: text1,
      ),
      dividerColor: hairline,
      appBarTheme: const AppBarTheme(
        backgroundColor: sidebarBg,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: text1,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardThemeData(
        color: surface2,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rMd),
          side: const BorderSide(color: borderSubtle, width: 1),
        ),
      ),
    );
  }
}
