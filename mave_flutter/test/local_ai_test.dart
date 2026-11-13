import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mave_flutter/core/theme/mave_theme.dart';
import 'package:mave_flutter/features/local_ai/local_ai_view.dart';

void main() {
  testWidgets('LocalAiView displays hardware acceleration and model slots', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MaveTheme.darkTheme,
        home: const LocalAiView(),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    // Verify Hardware Acceleration card
    expect(find.text('HARDWARE-AWARE ACCELERATION'), findsOneWidget);
    expect(find.text('Allocated VRAM: 6.5 GB / 24.0 GB'), findsOneWidget);

    // Verify Model slots
    expect(find.text('Qwen3-VL 8B Instruct'), findsOneWidget);
    expect(find.text('Qwen3.6-35B-A14B / DeepSeek MoE'), findsOneWidget);
    expect(find.text('Whisper Base (English)'), findsOneWidget);
    expect(find.text('Kokoro 82M v1.0'), findsOneWidget);
  });
}
