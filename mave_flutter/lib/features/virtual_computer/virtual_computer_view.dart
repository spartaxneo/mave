import 'package:flutter/material.dart';
import '../../core/theme/mave_theme.dart';
import '../../core/tactile/tactile_feedback.dart';

/// MAVE Virtual Computer & Isolated Sandbox Workspace
/// Displays sandboxed guest execution, headless browser workers, and interactive terminals.
class VirtualComputerView extends StatefulWidget {
  const VirtualComputerView({super.key});

  @override
  State<VirtualComputerView> createState() => _VirtualComputerViewState();
}

class _VirtualComputerViewState extends State<VirtualComputerView> {
  int _activeTerminalTab = 0;
  final List<String> _terminalTabs = ['conpty-main', 'worker-sandbox', 'browser-worker'];

  final List<String> _terminalLog = [
    'MAVE GUEST SANDBOX INITIALIZED [TARGET: virtual_computer]',
    '\$ node --version',
    'v22.11.0',
    '\$ git status --porcelain',
    ' M lib/main.dart',
    '?? mave_flutter/',
    '\$ flutter analyze --no-fatal-infos',
    'Analyzing mave_flutter...',
    'No issues found! (0 errors, 0 warnings)',
    '[HOST NON-INTERFERENCE]: Physical display session protected.',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaveTheme.bg,
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Non-Interference Invariant Guard
            _buildSafetyGuardBanner(),

            const SizedBox(height: 16),

            // Terminal Tabs
            Row(
              children: [
                for (int i = 0; i < _terminalTabs.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  TactileButton(
                    onTap: () => setState(() => _activeTerminalTab = i),
                    color: _activeTerminalTab == i ? MaveTheme.surface3 : MaveTheme.surface1,
                    borderRadius: BorderRadius.circular(MaveTheme.rSm),
                    border: Border.all(
                      color: _activeTerminalTab == i ? MaveTheme.accent : MaveTheme.borderSubtle,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.terminal,
                          size: 14,
                          color: _activeTerminalTab == i ? MaveTheme.accent : MaveTheme.text3,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _terminalTabs[i],
                          style: TextStyle(
                            color: _activeTerminalTab == i ? MaveTheme.text1 : MaveTheme.text2,
                            fontSize: 12,
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),

            const SizedBox(height: 10),

            // Black Obsidian Terminal Canvas
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(MaveTheme.rMd),
                  border: Border.all(color: MaveTheme.borderSubtle),
                ),
                child: ListView.builder(
                  itemCount: _terminalLog.length,
                  itemBuilder: (context, index) {
                    final line = _terminalLog[index];
                    final isCommand = line.startsWith('\$');
                    final isSuccess = line.contains('No issues found') || line.contains('INITIALIZED');
                    final isWarning = line.contains('[HOST NON-INTERFERENCE]');

                    Color textColor = MaveTheme.text2;
                    if (isCommand) textColor = Colors.white;
                    if (isSuccess) textColor = MaveTheme.accent;
                    if (isWarning) textColor = MaveTheme.info;

                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(
                        line,
                        style: TextStyle(
                          color: textColor,
                          fontFamily: 'monospace',
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSafetyGuardBanner() {
    return MaveSurfaceCard(
      backgroundColor: MaveTheme.surface1,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: MaveTheme.accentSubtle,
                  borderRadius: BorderRadius.circular(MaveTheme.rSm),
                ),
                child: const Icon(Icons.shield_outlined, color: MaveTheme.accent, size: 18),
              ),
              const SizedBox(width: 12),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'GUEST VIRTUAL SANDBOX ACTIVE',
                    style: TextStyle(
                      color: MaveTheme.text1,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Host Non-Interference: Zero cursor takeover · Headless Worktrees',
                    style: TextStyle(color: MaveTheme.text3, fontSize: 11),
                  ),
                ],
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: MaveTheme.accentSubtle,
              borderRadius: BorderRadius.circular(MaveTheme.rSm),
              border: Border.all(color: MaveTheme.accent.withValues(alpha: 0.3)),
            ),
            child: const Text(
              'GUEST SAFE',
              style: TextStyle(color: MaveTheme.accent, fontSize: 10, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
