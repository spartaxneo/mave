import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mave_flutter/core/theme/mave_theme.dart';
import 'package:mave_flutter/features/island/dynamic_island_overlay.dart';

void main() {
  testWidgets('DynamicIslandOverlay toggles expanded state on tap', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MaveTheme.darkTheme,
        home: const Scaffold(
          body: DynamicIslandOverlay(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    // Initially in compact pill state
    expect(find.text('MAVE Brain Active'), findsOneWidget);
    expect(find.text('MAVE ISLAND'), findsNothing);

    // Tap to expand
    await tester.tap(find.text('MAVE Brain Active'));
    await tester.pump(const Duration(milliseconds: 350));

    // Now in expanded state
    expect(find.text('MAVE ISLAND'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
  });
}
