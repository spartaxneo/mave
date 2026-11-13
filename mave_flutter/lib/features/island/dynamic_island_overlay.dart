import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/theme/mave_theme.dart';
import '../../core/tactile/tactile_feedback.dart';

/// Dynamic Island HUD & Companion Notch
/// Recreates the MAVE/Vorssaint tactile dynamic island on Flutter with 1:1 spring physics.
class DynamicIslandOverlay extends StatefulWidget {
  final VoidCallback? onToggleExpand;
  final ValueChanged<String>? onQuickAction;
  final ValueChanged<String>? onSubmitPrompt;
  final bool isListening;
  final String statusText;

  const DynamicIslandOverlay({
    super.key,
    this.onToggleExpand,
    this.onQuickAction,
    this.onSubmitPrompt,
    this.isListening = false,
    this.statusText = 'MAVE Brain Active',
  });

  @override
  State<DynamicIslandOverlay> createState() => _DynamicIslandOverlayState();
}

class _DynamicIslandOverlayState extends State<DynamicIslandOverlay>
    with SingleTickerProviderStateMixin {
  bool _isExpanded = false;
  late AnimationController _waveController;
  final TextEditingController _promptController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _waveController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _waveController.dispose();
    _promptController.dispose();
    super.dispose();
  }

  void _toggleExpanded() {
    setState(() {
      _isExpanded = !_isExpanded;
    });
    widget.onToggleExpand?.call();
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isCompact = screenWidth < 600;

    final targetWidth = _isExpanded
        ? math.min(screenWidth - 32, 460.0)
        : (isCompact ? 240.0 : 270.0);
    final targetHeight = _isExpanded ? 154.0 : 38.0;

    return Center(
      child: AnimatedContainer(
        duration: MaveTheme.spring,
        curve: MaveTheme.springCurve,
        width: targetWidth,
        height: targetHeight,
        margin: const EdgeInsets.only(top: 8),
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(_isExpanded ? MaveTheme.rXl : 20.0),
          border: Border.all(
            color: _isExpanded ? MaveTheme.accent.withValues(alpha: 0.3) : MaveTheme.borderSubtle,
            width: 1.0,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.8),
              blurRadius: _isExpanded ? 32 : 16,
              offset: const Offset(0, 8),
            ),
            if (_isExpanded)
              BoxShadow(
                color: MaveTheme.accent.withValues(alpha: 0.15),
                blurRadius: 24,
                spreadRadius: 2,
              ),
          ],
        ),
        clipBehavior: Clip.hardEdge,
        child: _isExpanded ? _buildExpandedContent() : _buildCompactPill(),
      ),
    );
  }

  /// Compact Capsule View (Mac Vorssaint Notch Style)
  Widget _buildCompactPill() {
    return InkWell(
      onTap: _toggleExpanded,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Left: Mini Mascot Face Icon
            Expanded(
              child: Row(
                children: [
                  Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      color: MaveTheme.accentSubtle,
                      shape: BoxShape.circle,
                      border: Border.all(color: MaveTheme.accent, width: 1.2),
                    ),
                    child: const Center(
                      child: Icon(Icons.circle, size: 6, color: MaveTheme.accent),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.statusText,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: MaveTheme.text1,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),

            // Center: Camera Cutout with Active Sensor Dot
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: const Color(0xFF09090B),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white.withValues(alpha: 0.1), width: 1),
              ),
              child: Center(
                child: Container(
                  width: 4,
                  height: 4,
                  decoration: BoxDecoration(
                    color: widget.isListening ? MaveTheme.danger : MaveTheme.success,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: (widget.isListening ? MaveTheme.danger : MaveTheme.success)
                            .withValues(alpha: 0.8),
                        blurRadius: 4,
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Right: Animated Audio Equalizer Waveform
            AnimatedBuilder(
              animation: _waveController,
              builder: (context, child) {
                return Row(
                  children: List.generate(4, (index) {
                    final phase = (index * 0.25);
                    final value = math.sin((_waveController.value + phase) * math.pi);
                    final barHeight = 4.0 + (value.abs() * 10.0);
                    return Container(
                      width: 2.5,
                      height: barHeight,
                      margin: const EdgeInsets.only(left: 2.5),
                      decoration: BoxDecoration(
                        color: widget.isListening ? MaveTheme.danger : MaveTheme.accent,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    );
                  }),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  /// Expanded Island HUD View
  Widget _buildExpandedContent() {
    return SingleChildScrollView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Top Header Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: [
                    Flexible(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: MaveTheme.accentSubtle,
                          borderRadius: BorderRadius.circular(MaveTheme.rSm),
                          border: Border.all(color: MaveTheme.accent.withValues(alpha: 0.4)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                color: MaveTheme.accent,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Flexible(
                              child: Text(
                                'MAVE ISLAND',
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: MaveTheme.accent,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        widget.statusText,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: MaveTheme.text2, fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              TactileButton(
                onTap: _toggleExpanded,
                padding: const EdgeInsets.all(4),
                child: const Icon(Icons.close, size: 16, color: MaveTheme.text3),
              ),
            ],
          ),

          const SizedBox(height: 10),

          // Central Quick Prompt Bar
          Container(
            height: 38,
            decoration: BoxDecoration(
              color: MaveTheme.surface1,
              borderRadius: BorderRadius.circular(MaveTheme.rMd),
              border: Border.all(color: MaveTheme.borderSubtle),
            ),
            child: Row(
              children: [
                const SizedBox(width: 10),
                const Icon(Icons.chat_bubble_outline, size: 16, color: MaveTheme.text3),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _promptController,
                    style: const TextStyle(color: MaveTheme.text1, fontSize: 13),
                    decoration: const InputDecoration(
                      hintText: 'Ask MAVE, trigger action, or press Enter...',
                      hintStyle: TextStyle(color: MaveTheme.text3, fontSize: 12),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                    onSubmitted: (text) {
                      if (text.trim().isNotEmpty) {
                        widget.onSubmitPrompt?.call(text.trim());
                        _promptController.clear();
                      }
                    },
                  ),
                ),
                TactileButton(
                  onTap: () {
                    final text = _promptController.text.trim();
                    if (text.isNotEmpty) {
                      widget.onSubmitPrompt?.call(text);
                      _promptController.clear();
                    }
                  },
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  color: MaveTheme.accent,
                  child: const Icon(Icons.arrow_upward, size: 16, color: Colors.white),
                ),
                const SizedBox(width: 4),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // Bottom Quick Navigation Pills
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildActionPill(Icons.hub_outlined, 'Mesh', 'mesh'),
                _buildActionPill(Icons.memory_outlined, 'Local AI', 'local_ai'),
                _buildActionPill(Icons.terminal_outlined, 'Virtual PC', 'virtual_pc'),
                _buildActionPill(Icons.storage_outlined, 'Memory', 'memory'),
                _buildActionPill(Icons.settings_outlined, 'Settings', 'settings'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionPill(IconData icon, String label, String key) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: TactileButton(
        onTap: () => widget.onQuickAction?.call(key),
        color: MaveTheme.surface2,
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        borderRadius: BorderRadius.circular(MaveTheme.rSm),
        border: Border.all(color: MaveTheme.borderSubtle),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: MaveTheme.text2),
            const SizedBox(width: 4),
            Text(
              label,
              style: const TextStyle(
                color: MaveTheme.text1,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
