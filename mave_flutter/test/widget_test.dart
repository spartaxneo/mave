import 'package:flutter_test/flutter_test.dart';
import 'package:mave_flutter/main.dart';
import 'package:mave_flutter/features/island/dynamic_island_overlay.dart';
import 'package:mave_flutter/features/mascot/vorssaint_mascot.dart';

void main() {
  testWidgets('MAVE cross-platform shell renders with Island and Mascot', (WidgetTester tester) async {
    await tester.pumpWidget(const MaveApp(initialProvisioned: true));
    // Pump frames to initialize state without waiting indefinitely for continuous loop animations
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    // Verify presence of Dynamic Island and Mascot
    expect(find.byType(DynamicIslandOverlay), findsOneWidget);
    expect(find.byType(VorssaintMascot), findsOneWidget);

    // Verify initial Canvas view
    expect(find.text('WORKSPACE CANVAS'), findsOneWidget);
  });
}
