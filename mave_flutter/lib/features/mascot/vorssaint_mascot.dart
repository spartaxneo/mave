import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/theme/mave_theme.dart';

enum MascotMood {
  idle,
  thinking,
  speaking,
  happy,
  alert,
  sleeping,
}

/// Vorssaint Mascot Rig
/// Full tactile companion character with eye-tracking parallax, blinking,
/// mood states, and spring-drag physics.
class VorssaintMascot extends StatefulWidget {
  final MascotMood mood;
  final double size;
  final VoidCallback? onTap;

  const VorssaintMascot({
    super.key,
    this.mood = MascotMood.idle,
    this.size = 80.0,
    this.onTap,
  });

  @override
  State<VorssaintMascot> createState() => _VorssaintMascotState();
}

class _VorssaintMascotState extends State<VorssaintMascot>
    with TickerProviderStateMixin {
  Offset _lookTarget = Offset.zero;
  bool _isBlinking = false;
  Timer? _blinkTimer;
  late AnimationController _pulseController;
  late AnimationController _speakController;
  bool _isPressed = false;

  @override
  void initState() {
    super.initState();
    _startBlinkCycle();

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);

    _speakController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 250),
    );

    if (widget.mood == MascotMood.speaking) {
      _speakController.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(covariant VorssaintMascot oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.mood == MascotMood.speaking) {
      if (!_speakController.isAnimating) _speakController.repeat(reverse: true);
    } else {
      _speakController.stop();
      _speakController.reset();
    }
  }

  @override
  void dispose() {
    _blinkTimer?.cancel();
    _pulseController.dispose();
    _speakController.dispose();
    super.dispose();
  }

  void _startBlinkCycle() {
    _blinkTimer?.cancel();
    final nextBlink = 2500 + math.Random().nextInt(3500);
    _blinkTimer = Timer(Duration(milliseconds: nextBlink), () {
      if (!mounted) return;
      setState(() => _isBlinking = true);
      Future.delayed(const Duration(milliseconds: 140), () {
        if (!mounted) return;
        setState(() => _isBlinking = false);
        _startBlinkCycle();
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onHover: (event) {
        final box = context.findRenderObject() as RenderBox?;
        if (box != null) {
          final center = box.size.center(Offset.zero);
          final diff = event.localPosition - center;
          final maxDist = widget.size / 2;
          final clampedX = (diff.dx / maxDist).clamp(-1.0, 1.0);
          final clampedY = (diff.dy / maxDist).clamp(-1.0, 1.0);
          setState(() {
            _lookTarget = Offset(clampedX, clampedY);
          });
        }
      },
      child: GestureDetector(
        onTapDown: (_) => setState(() => _isPressed = true),
        onTapUp: (_) => setState(() => _isPressed = false),
        onTapCancel: () => setState(() => _isPressed = false),
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: _isPressed ? MaveTheme.touchDownScale : 1.0,
          duration: MaveTheme.fast,
          curve: MaveTheme.springCurve,
          child: AnimatedBuilder(
            animation: Listenable.merge([_pulseController, _speakController]),
            builder: (context, child) {
              return CustomPaint(
                size: Size(widget.size, widget.size),
                painter: _MascotPainter(
                  mood: widget.mood,
                  lookOffset: _lookTarget,
                  isBlinking: _isBlinking,
                  pulseValue: _pulseController.value,
                  speakValue: _speakController.value,
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _MascotPainter extends CustomPainter {
  final MascotMood mood;
  final Offset lookOffset;
  final bool isBlinking;
  final double pulseValue;
  final double speakValue;

  _MascotPainter({
    required this.mood,
    required this.lookOffset,
    required this.isBlinking,
    required this.pulseValue,
    required this.speakValue,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;

    // Outer Ambient Glow
    final glowPaint = Paint()
      ..color = (mood == MascotMood.alert ? MaveTheme.danger : MaveTheme.accent)
          .withValues(alpha: 0.15 + (pulseValue * 0.15))
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 16);
    canvas.drawCircle(center, radius - 4, glowPaint);

    // Body Capsule (Dark Obsidian Glass)
    final bodyPaint = Paint()
      ..shader = RadialGradient(
        colors: [
          const Color(0xFF262626),
          const Color(0xFF0F0F0F),
        ],
        radius: 0.85,
      ).createShader(Rect.fromCircle(center: center, radius: radius));
    canvas.drawCircle(center, radius - 6, bodyPaint);

    // Subtle Rim Border
    final rimPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    canvas.drawCircle(center, radius - 6, rimPaint);

    // Eyes Configuration
    final eyeSpacing = size.width * 0.18;
    final eyeY = center.dy - (size.height * 0.05);
    final leftEyeCenter = Offset(center.dx - eyeSpacing, eyeY);
    final rightEyeCenter = Offset(center.dx + eyeSpacing, eyeY);
    final eyeRadius = size.width * 0.09;

    if (mood == MascotMood.sleeping || isBlinking) {
      // Closed Eyelids (Arc lines)
      final eyeArcPaint = Paint()
        ..color = MaveTheme.accent
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = 2.5;

      canvas.drawLine(
        Offset(leftEyeCenter.dx - eyeRadius, leftEyeCenter.dy),
        Offset(leftEyeCenter.dx + eyeRadius, leftEyeCenter.dy),
        eyeArcPaint,
      );
      canvas.drawLine(
        Offset(rightEyeCenter.dx - eyeRadius, rightEyeCenter.dy),
        Offset(rightEyeCenter.dx + eyeRadius, rightEyeCenter.dy),
        eyeArcPaint,
      );
    } else {
      // Open Glowing Emerald Eyes with Pupil Parallax
      final eyeScleraPaint = Paint()
        ..color = MaveTheme.accent.withValues(alpha: 0.2)
        ..style = PaintingStyle.fill;

      canvas.drawCircle(leftEyeCenter, eyeRadius, eyeScleraPaint);
      canvas.drawCircle(rightEyeCenter, eyeRadius, eyeScleraPaint);

      // Pupil with Parallax Offset
      final pupilOffset = Offset(
        lookOffset.dx * (eyeRadius * 0.5),
        lookOffset.dy * (eyeRadius * 0.5),
      );

      final pupilPaint = Paint()
        ..color = mood == MascotMood.alert ? MaveTheme.danger : MaveTheme.accent
        ..style = PaintingStyle.fill;

      canvas.drawCircle(leftEyeCenter + pupilOffset, eyeRadius * 0.6, pupilPaint);
      canvas.drawCircle(rightEyeCenter + pupilOffset, eyeRadius * 0.6, pupilPaint);

      // Highlight Sparkle
      final sparklePaint = Paint()..color = Colors.white.withValues(alpha: 0.9);
      final sparkleOffset = pupilOffset + const Offset(-1.5, -1.5);
      canvas.drawCircle(leftEyeCenter + sparkleOffset, eyeRadius * 0.2, sparklePaint);
      canvas.drawCircle(rightEyeCenter + sparkleOffset, eyeRadius * 0.2, sparklePaint);
    }

    // Mouth / Speaking Synthesizer
    final mouthY = center.dy + (size.height * 0.16);
    final mouthPaint = Paint()
      ..color = MaveTheme.accent.withValues(alpha: 0.7)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 2.0;

    if (mood == MascotMood.speaking) {
      final mouthOpen = 2.0 + (speakValue * 5.0);
      final mouthRect = Rect.fromCenter(
        center: Offset(center.dx, mouthY),
        width: 14,
        height: mouthOpen,
      );
      final fillPaint = Paint()..color = MaveTheme.accent;
      canvas.drawRRect(RRect.fromRectAndRadius(mouthRect, const Radius.circular(4)), fillPaint);
    } else if (mood == MascotMood.happy) {
      // Smile curve
      final path = Path()
        ..moveTo(center.dx - 8, mouthY)
        ..quadraticBezierTo(center.dx, mouthY + 5, center.dx + 8, mouthY);
      canvas.drawPath(path, mouthPaint);
    } else {
      // Neutral resting line
      canvas.drawLine(
        Offset(center.dx - 6, mouthY),
        Offset(center.dx + 6, mouthY),
        mouthPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _MascotPainter oldDelegate) {
    return oldDelegate.mood != mood ||
        oldDelegate.lookOffset != lookOffset ||
        oldDelegate.isBlinking != isBlinking ||
        oldDelegate.pulseValue != pulseValue ||
        oldDelegate.speakValue != speakValue;
  }
}
