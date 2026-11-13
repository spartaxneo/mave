import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mave_flutter/core/theme/mave_theme.dart';
import 'package:mave_flutter/features/mesh/mesh_dashboard_view.dart';

void main() {
  testWidgets('MeshDashboardView displays 5 Hallmark metric tiles and devices', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MaveTheme.darkTheme,
        home: const MeshDashboardView(),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    // Verify presence of 5 Hallmark metric tiles
    expect(find.text('CONNECTED DEVICES'), findsOneWidget);
    expect(find.text('CLUSTER CORES'), findsOneWidget);
    expect(find.text('SHARED RAM'), findsOneWidget);
    expect(find.text('VRAM POOL'), findsOneWidget);
    expect(find.text('ACTIVE DAG JOBS'), findsOneWidget);

    // Verify presence of Paired Devices
    expect(find.text('Primary Workstation (Desktop)'), findsOneWidget);
    expect(find.text('MacBook Pro Satellite'), findsOneWidget);
    expect(find.text('Meta Quest / Spatial Node'), findsOneWidget);
  });
}
