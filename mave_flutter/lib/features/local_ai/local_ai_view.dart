import 'package:flutter/material.dart';
import '../../core/theme/mave_theme.dart';
import '../../core/tactile/tactile_feedback.dart';

class LocalModelSlot {
  final String name;
  final String role;
  final String backend;
  final int port;
  final String status; // 'running' | 'standby' | 'off'
  final double tokensPerSec;
  final int ttftMs;
  final int memoryMb;

  const LocalModelSlot({
    required this.name,
    required this.role,
    required this.backend,
    required this.port,
    required this.status,
    required this.tokensPerSec,
    required this.ttftMs,
    required this.memoryMb,
  });
}

/// MAVE Local AI & Model Routing Engine
/// Hardware-aware model routing, GPU telemetry, and local inference server management.
class LocalAiView extends StatefulWidget {
  const LocalAiView({super.key});

  @override
  State<LocalAiView> createState() => _LocalAiViewState();
}

class _LocalAiViewState extends State<LocalAiView> {
  String _activePolicy = 'STRICT_LOCAL_ONLY';

  final List<LocalModelSlot> _slots = const [
    LocalModelSlot(
      name: 'Qwen3-VL 8B Instruct',
      role: 'Vision & Fast Action',
      backend: 'llama-server (Vulkan b11276)',
      port: 8080,
      status: 'running',
      tokensPerSec: 48.6,
      ttftMs: 142,
      memoryMb: 5800,
    ),
    LocalModelSlot(
      name: 'Qwen3.6-35B-A14B / DeepSeek MoE',
      role: 'Deep Programming & Logic',
      backend: 'Colibri MoE Engine',
      port: 8000,
      status: 'standby',
      tokensPerSec: 28.2,
      ttftMs: 290,
      memoryMb: 14200,
    ),
    LocalModelSlot(
      name: 'Whisper Base (English)',
      role: 'Speech-to-Text STT',
      backend: 'whisper-server',
      port: 8082,
      status: 'running',
      tokensPerSec: 0,
      ttftMs: 64,
      memoryMb: 420,
    ),
    LocalModelSlot(
      name: 'Kokoro 82M v1.0',
      role: 'Text-to-Speech TTS',
      backend: 'onnxruntime-node',
      port: 8083,
      status: 'running',
      tokensPerSec: 0,
      ttftMs: 38,
      memoryMb: 310,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaveTheme.bg,
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Hardware Acceleration Card
            _buildHardwareCard(),

            const SizedBox(height: 16),

            // Policy Selector Header
            const Text(
              'ROUTING POLICY & PRIVACY PROFILE',
              style: TextStyle(
                color: MaveTheme.text3,
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              child: Row(
                children: [
                  _buildPolicyPill('STRICT_LOCAL_ONLY', 'Strict Local Only (Air-gapped)'),
                  const SizedBox(width: 8),
                  _buildPolicyPill('PREFER_FREE', 'Prefer Free FOSS'),
                  const SizedBox(width: 8),
                  _buildPolicyPill('MAXIMUM_PRIVACY', 'Maximum Privacy'),
                  const SizedBox(width: 8),
                  _buildPolicyPill('BEST_QUALITY', 'Best Quality (Opt-in Cloud)'),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // Active Local Model Slots
            const Text(
              'LOCAL INFERENCE MODEL SLOTS',
              style: TextStyle(
                color: MaveTheme.text3,
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 10),
            ..._slots.map(_buildSlotCard),
          ],
        ),
      ),
    );
  }

  Widget _buildHardwareCard() {
    return MaveSurfaceCard(
      backgroundColor: MaveTheme.surface1,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: MaveTheme.accentSubtle,
                        borderRadius: BorderRadius.circular(MaveTheme.rSm),
                        border: Border.all(color: MaveTheme.accent.withValues(alpha: 0.3)),
                      ),
                      child: const Icon(Icons.memory, color: MaveTheme.accent, size: 20),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'HARDWARE-AWARE ACCELERATION',
                            style: TextStyle(
                              color: MaveTheme.text1,
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Vulkan b11276 / Apple Metal / Qualcomm Hexagon NPU',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: MaveTheme.text3, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: MaveTheme.success.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(MaveTheme.rSm),
                  border: Border.all(color: MaveTheme.success.withValues(alpha: 0.4)),
                ),
                child: const Text(
                  'GPU ACTIVE: 48°C',
                  style: TextStyle(
                    color: MaveTheme.success,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Allocated VRAM: 6.5 GB / 24.0 GB', style: TextStyle(color: MaveTheme.text2, fontSize: 12)),
              Text('27% Utilized', style: TextStyle(color: MaveTheme.accent, fontSize: 12, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 6),
          LinearProgressIndicator(
            value: 0.27,
            backgroundColor: MaveTheme.surface3,
            valueColor: const AlwaysStoppedAnimation<Color>(MaveTheme.accent),
            minHeight: 5,
            borderRadius: BorderRadius.circular(3),
          ),
        ],
      ),
    );
  }

  Widget _buildPolicyPill(String policyKey, String label) {
    final isSelected = _activePolicy == policyKey;
    return TactileButton(
      onTap: () => setState(() => _activePolicy = policyKey),
      color: isSelected ? MaveTheme.accent : MaveTheme.surface2,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      borderRadius: BorderRadius.circular(MaveTheme.rSm),
      border: Border.all(
        color: isSelected ? MaveTheme.accent : MaveTheme.borderSubtle,
      ),
      child: Text(
        label,
        style: TextStyle(
          color: isSelected ? Colors.white : MaveTheme.text2,
          fontSize: 11,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        ),
      ),
    );
  }

  Widget _buildSlotCard(LocalModelSlot slot) {
    final isRunning = slot.status == 'running';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: MaveSurfaceCard(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: isRunning ? MaveTheme.accentSubtle : MaveTheme.surface3,
                borderRadius: BorderRadius.circular(MaveTheme.rSm),
              ),
              child: Icon(
                isRunning ? Icons.play_arrow : Icons.pause,
                color: isRunning ? MaveTheme.accent : MaveTheme.text3,
                size: 18,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        slot.name,
                        style: const TextStyle(
                          color: MaveTheme.text1,
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                        decoration: BoxDecoration(
                          color: MaveTheme.surface3,
                          borderRadius: BorderRadius.circular(MaveTheme.rSm),
                        ),
                        child: Text(
                          ':${slot.port}',
                          style: const TextStyle(color: MaveTheme.text3, fontSize: 10, fontFamily: 'monospace'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${slot.role} · ${slot.backend} · ${slot.memoryMb}MB VRAM',
                    style: const TextStyle(color: MaveTheme.text3, fontSize: 11),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (slot.tokensPerSec > 0)
                  Text(
                    '${slot.tokensPerSec} tok/s',
                    style: const TextStyle(
                      color: MaveTheme.accent,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                Text(
                  'TTFT: ${slot.ttftMs}ms',
                  style: const TextStyle(color: MaveTheme.text3, fontSize: 10),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
