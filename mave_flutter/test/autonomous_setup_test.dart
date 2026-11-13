import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mave_flutter/main.dart';
import 'package:mave_flutter/features/onboarding/autonomous_setup_view.dart';
import 'package:mave_flutter/features/island/dynamic_island_overlay.dart';

void main() {
  testWidgets('AutonomousSetupView guides user through zero-friction setup', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1200, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    // 1. Mount unprovisioned app
    await tester.pumpWidget(const MaveApp(initialProvisioned: false));
    await tester.pump(const Duration(milliseconds: 100));

    // Verify Autonomous Setup View is active
    expect(find.byType(AutonomousSetupView), findsOneWidget);
    expect(find.text('MAVE Autonomous Setup'), findsOneWidget);
    final grantBtn = find.textContaining('Grant System Permissions *');
    expect(grantBtn, findsOneWidget);

    // 2. User taps 'Grant System Permissions *' (the only manual user action on any OS)
    await tester.ensureVisible(grantBtn);
    await tester.tap(grantBtn);
    await tester.pump();

    // Pump through autonomous cascade steps
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pump(const Duration(milliseconds: 800));

    // Verify completion
    final enterBtn = find.text('Enter MAVE Workspace');
    expect(enterBtn, findsOneWidget);
    expect(find.text('MAVE is fully ready'), findsOneWidget);

    // 3. Enter MAVE Workspace
    await tester.ensureVisible(enterBtn);
    await tester.tap(enterBtn);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(seconds: 3)); // Drain mascot happy timer

    // Verify transition into main workspace shell with Dynamic Island
    expect(find.byType(DynamicIslandOverlay), findsOneWidget);
    expect(find.text('WORKSPACE CANVAS'), findsOneWidget);
  });
}
