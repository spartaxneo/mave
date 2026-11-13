import 'package:flutter/material.dart';
import '../theme/mave_theme.dart';

/// Zero Touch-Down Latency Tactile Button (scale: 0.97)
/// Conforms to Apple-Design tactile responsiveness and fluid physics.
class TactileButton extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? padding;
  final Color? color;
  final Color? hoverColor;
  final BorderRadius? borderRadius;
  final Border? border;
  final double scaleDown;

  const TactileButton({
    super.key,
    required this.child,
    this.onTap,
    this.padding,
    this.color,
    this.hoverColor,
    this.borderRadius,
    this.border,
    this.scaleDown = MaveTheme.touchDownScale,
  });

  @override
  State<TactileButton> createState() => _TactileButtonState();
}

class _TactileButtonState extends State<TactileButton> {
  bool _isDown = false;
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    final effectiveRadius = widget.borderRadius ?? BorderRadius.circular(MaveTheme.rMd);
    final effectiveColor = _isHovered
        ? (widget.hoverColor ?? widget.color ?? MaveTheme.surface3)
        : (widget.color ?? Colors.transparent);

    return MouseRegion(
      cursor: widget.onTap != null ? SystemMouseCursors.click : SystemMouseCursors.basic,
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => _isDown = true),
        onTapUp: (_) => setState(() => _isDown = false),
        onTapCancel: () => setState(() => _isDown = false),
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: _isDown ? widget.scaleDown : 1.0,
          duration: MaveTheme.fast,
          curve: MaveTheme.springCurve,
          child: AnimatedContainer(
            duration: MaveTheme.fast,
            padding: widget.padding ?? const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: effectiveColor,
              borderRadius: effectiveRadius,
              border: widget.border,
            ),
            clipBehavior: Clip.hardEdge,
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

/// Mobile Density Mandate: Edge-to-Edge Scrollable Horizontal Rail
/// Conforms to LR-029 & LR-037: on compact/mobile screens, groups metrics, categories,
/// and items into horizontal rails rather than endless vertical scrolls.
class FromNearHorizontalRail extends StatelessWidget {
  final List<Widget> children;
  final EdgeInsetsGeometry padding;
  final double spacing;

  const FromNearHorizontalRail({
    super.key,
    required this.children,
    this.padding = const EdgeInsets.symmetric(horizontal: 16),
    this.spacing = 10,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      padding: padding,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (int i = 0; i < children.length; i++) ...[
            if (i > 0) SizedBox(width: spacing),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// High-Contrast Surface Card with Hairline Border and HardEdge Clip (LR-086)
class MaveSurfaceCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? backgroundColor;
  final Color? borderColor;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;

  const MaveSurfaceCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.backgroundColor,
    this.borderColor,
    this.width,
    this.height,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final r = borderRadius ?? BorderRadius.circular(MaveTheme.rMd);
    return Container(
      width: width,
      height: height,
      padding: padding,
      decoration: BoxDecoration(
        color: backgroundColor ?? MaveTheme.surface2,
        borderRadius: r,
        border: Border.all(
          color: borderColor ?? MaveTheme.borderSubtle,
          width: 1.0,
        ),
      ),
      clipBehavior: Clip.hardEdge,
      child: child,
    );
  }
}
