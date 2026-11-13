import 'package:flutter_test/flutter_test.dart';
import 'package:mave_flutter/core/router/edge_semantic_router.dart';

void main() {
  group('EdgeSemanticRouter on-device intelligence dispatch', () {
    final router = EdgeSemanticRouter();

    test('routes mobile camera & sensor requests to localMobileTool', () async {
      final decision = await router.routePrompt('Please take a photo and scan QR code');
      expect(decision.target, equals(DispatchTarget.localMobileTool));
      expect(decision.toolName, equals('mobile_camera_vision'));
      expect(decision.confidence, greaterThan(0.9));
    });

    test('routes desktop OS & screen automation to meshWorkstation', () async {
      final decision = await router.routePrompt('Click the submit button on my desktop screen');
      expect(decision.target, equals(DispatchTarget.meshWorkstation));
      expect(decision.toolName, equals('desktop_computer_use'));
      expect(decision.arguments['requiresVision'], isTrue);
    });

    test('routes deep architectural engineering to frontierCloud / heavy workstation', () async {
      final decision = await router.routePrompt(
        'Architect a distributed database cluster with Raft consensus',
        isMeshHostOnline: false,
      );
      expect(decision.target, equals(DispatchTarget.frontierCloud));
      expect(decision.toolName, equals('deep_cognitive_synthesizer'));
    });

    test('handles simple everyday conversation directly on mobile edge SLM', () async {
      final decision = await router.routePrompt('What is the capital of France?');
      expect(decision.target, equals(DispatchTarget.edgeDirect));
      expect(decision.toolName, equals('edge_slm_fast_response'));
    });

    test('executes routed decisions cleanly without runtime exceptions', () async {
      final decision = await router.routePrompt('What time is it in Tokyo?');
      final result = await router.execute(decision, 'What time is it in Tokyo?');
      expect(result['ok'], isTrue);
      expect(result['tier'], equals('edgeDirect'));
    });
  });
}
