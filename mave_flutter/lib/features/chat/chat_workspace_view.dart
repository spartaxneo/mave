import 'package:flutter/material.dart';
import '../../core/theme/mave_theme.dart';
import '../../core/tactile/tactile_feedback.dart';

class ChatMessage {
  final String id;
  final String sender; // 'user' | 'assistant' | 'system'
  final String text;
  final DateTime timestamp;
  final String? codeSnippet;
  final String? artifactTitle;
  final String? toolVerificationBadge;

  const ChatMessage({
    required this.id,
    required this.sender,
    required this.text,
    required this.timestamp,
    this.codeSnippet,
    this.artifactTitle,
    this.toolVerificationBadge,
  });
}

/// MAVE Chat Canvas & Agent Workspace
/// High-density developer interface with model routing pills, tool verification badges,
/// code artifacts, and multimodal input.
class ChatWorkspaceView extends StatefulWidget {
  final String? activeModel;
  final ValueChanged<String>? onModelChanged;
  final ValueChanged<String>? onSendMessage;

  const ChatWorkspaceView({
    super.key,
    this.activeModel,
    this.onModelChanged,
    this.onSendMessage,
  });

  @override
  State<ChatWorkspaceView> createState() => _ChatWorkspaceViewState();
}

class _ChatWorkspaceViewState extends State<ChatWorkspaceView> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  late String _currentModel;
  bool _isDictating = false;

  final List<String> _models = const [
    'Qwen3-VL 8B (Vulkan 8080)',
    'Colibri MoE 35B (Port 8000)',
    'Claude 3.5 Sonnet (Direct)',
    'GPT-4o (Authorized API)',
  ];

  late List<ChatMessage> _messages;

  @override
  void initState() {
    super.initState();
    _currentModel = widget.activeModel ?? _models[0];
    _messages = [
      ChatMessage(
        id: 'msg-01',
        sender: 'system',
        text: 'MAVE V3 Cognitive Orchestrator initialized. Cross-platform runtime active on Flutter (Windows, macOS, Linux, iOS, Android & Oculus Horizon OS).',
        timestamp: DateTime.now().subtract(const Duration(minutes: 5)),
        toolVerificationBadge: 'GROUNDED & AUDITED',
      ),
      ChatMessage(
        id: 'msg-02',
        sender: 'user',
        text: 'Compile the distributed mesh flutter client and verify cluster communication.',
        timestamp: DateTime.now().subtract(const Duration(minutes: 3)),
      ),
      ChatMessage(
        id: 'msg-03',
        sender: 'assistant',
        text: 'I have scheduled the monorepo shard task across the Brain Mesh. The Flutter client architecture is assembled with native Tactile Apple-Design physics, Dynamic Island HUD, and 5-Tile Hallmark Mission Control.',
        timestamp: DateTime.now().subtract(const Duration(minutes: 2)),
        artifactTitle: 'mave_mesh_distributor.dart',
        codeSnippet: '''// Distributed Mesh Pipeline: Shard Compilation
final scheduler = DistributedScheduler(isPrimaryHost: true);
final topology = scheduler.getMeshTopology();
print('Active Mesh Cores: \${topology.totalClusterCores}');''',
        toolVerificationBadge: 'VERIFIED: 0 COMPILATION ERRORS',
      ),
    ];
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _sendCurrentText() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    final userMsg = ChatMessage(
      id: 'msg-${DateTime.now().millisecondsSinceEpoch}',
      sender: 'user',
      text: text,
      timestamp: DateTime.now(),
    );

    setState(() {
      _messages.add(userMsg);
      _textController.clear();
    });

    widget.onSendMessage?.call(text);

    // Auto-scroll to bottom
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: MaveTheme.normal,
          curve: MaveTheme.springCurve,
        );
      }
    });

    // Simulated responsive agent turn
    Future.delayed(const Duration(milliseconds: 600), () {
      if (!mounted) return;
      final agentMsg = ChatMessage(
        id: 'msg-reply-${DateTime.now().millisecondsSinceEpoch}',
        sender: 'assistant',
        text: 'Processed directive: "$text". 10-Step cognitive loop completed. Grounded verification active.',
        timestamp: DateTime.now(),
        toolVerificationBadge: 'VERIFIED PHYSICAL GROUNDING',
      );
      setState(() => _messages.add(agentMsg));
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: MaveTheme.normal,
            curve: MaveTheme.springCurve,
          );
        }
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaveTheme.bg,
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: MaveTheme.accent,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            const Text('WORKSPACE CANVAS'),
            const SizedBox(width: 14),
            // Model Selector Dropdown Pill
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
              decoration: BoxDecoration(
                color: MaveTheme.surface2,
                borderRadius: BorderRadius.circular(MaveTheme.rSm),
                border: Border.all(color: MaveTheme.borderSubtle),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _currentModel,
                  dropdownColor: MaveTheme.surface1,
                  isDense: true,
                  style: const TextStyle(
                    color: MaveTheme.text1,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                  icon: const Icon(Icons.arrow_drop_down, color: MaveTheme.text3, size: 18),
                  items: _models.map((model) {
                    return DropdownMenuItem<String>(
                      value: model,
                      child: Text(model),
                    );
                  }).toList(),
                  onChanged: (newModel) {
                    if (newModel != null) {
                      setState(() => _currentModel = newModel);
                      widget.onModelChanged?.call(newModel);
                    }
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Messages List View
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                return _buildMessageBubble(_messages[index]);
              },
            ),
          ),

          // Bottom Prompt Input Bar
          _buildInputBar(),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(ChatMessage msg) {
    final isUser = msg.sender == 'user';
    final isSystem = msg.sender == 'system';

    if (isSystem) {
      return Container(
        margin: const EdgeInsets.symmetric(vertical: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: MaveTheme.surface2,
          borderRadius: BorderRadius.circular(MaveTheme.rSm),
          border: Border.all(color: MaveTheme.borderSubtle),
        ),
        child: Row(
          children: [
            const Icon(Icons.info_outline, size: 16, color: MaveTheme.info),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                msg.text,
                style: const TextStyle(color: MaveTheme.text2, fontSize: 11),
              ),
            ),
            if (msg.toolVerificationBadge != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: MaveTheme.accentSubtle,
                  borderRadius: BorderRadius.circular(MaveTheme.rSm),
                ),
                child: Text(
                  msg.toolVerificationBadge ?? '',
                  style: const TextStyle(
                    color: MaveTheme.accent,
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
          ],
        ),
      );
    }

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.82,
        ),
        child: Column(
          crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            // Message Card
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isUser ? MaveTheme.surface3 : MaveTheme.surface1,
                borderRadius: BorderRadius.circular(MaveTheme.rMd),
                border: Border.all(
                  color: isUser ? MaveTheme.accent.withValues(alpha: 0.3) : MaveTheme.borderSubtle,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    msg.text,
                    style: const TextStyle(
                      color: MaveTheme.text1,
                      fontSize: 13,
                      height: 1.45,
                    ),
                  ),

                  // Code Artifact Card
                  if (msg.codeSnippet != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.black,
                        borderRadius: BorderRadius.circular(MaveTheme.rSm),
                        border: Border.all(color: MaveTheme.borderSubtle),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                msg.artifactTitle ?? 'Artifact',
                                style: const TextStyle(
                                  color: MaveTheme.text2,
                                  fontSize: 11,
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const Icon(Icons.copy, size: 14, color: MaveTheme.text3),
                            ],
                          ),
                          const Divider(color: MaveTheme.hairline, height: 12),
                          Text(
                            msg.codeSnippet ?? '',
                            style: const TextStyle(
                              color: MaveTheme.accent,
                              fontSize: 11,
                              fontFamily: 'monospace',
                              height: 1.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // Tool Verification Badge
            if (msg.toolVerificationBadge != null) ...[
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.verified, size: 12, color: MaveTheme.accent),
                  const SizedBox(width: 4),
                  Text(
                    msg.toolVerificationBadge ?? '',
                    style: const TextStyle(
                      color: MaveTheme.accent,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: MaveTheme.surface1,
        border: Border(top: BorderSide(color: MaveTheme.borderSubtle)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            // Dictation Mic Button
            TactileButton(
              onTap: () => setState(() => _isDictating = !_isDictating),
              color: _isDictating ? MaveTheme.danger : MaveTheme.surface2,
              padding: const EdgeInsets.all(9),
              borderRadius: BorderRadius.circular(MaveTheme.rSm),
              border: Border.all(color: MaveTheme.borderSubtle),
              child: Icon(
                _isDictating ? Icons.mic : Icons.mic_none,
                size: 18,
                color: _isDictating ? Colors.white : MaveTheme.text2,
              ),
            ),
            const SizedBox(width: 8),

            // Input TextField
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: MaveTheme.surface2,
                  borderRadius: BorderRadius.circular(MaveTheme.rSm),
                  border: Border.all(color: MaveTheme.borderSubtle),
                ),
                child: TextField(
                  controller: _textController,
                  style: const TextStyle(color: MaveTheme.text1, fontSize: 13),
                  maxLines: 4,
                  minLines: 1,
                  decoration: const InputDecoration(
                    hintText: 'Message MAVE (Shift+Enter for newline)...',
                    hintStyle: TextStyle(color: MaveTheme.text3, fontSize: 13),
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(vertical: 10),
                  ),
                  onSubmitted: (_) => _sendCurrentText(),
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Send Button
            TactileButton(
              onTap: _sendCurrentText,
              color: MaveTheme.accent,
              padding: const EdgeInsets.all(9),
              borderRadius: BorderRadius.circular(MaveTheme.rSm),
              child: const Icon(Icons.arrow_upward, size: 18, color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }
}
