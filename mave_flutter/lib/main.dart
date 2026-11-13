import 'package:flutter/material.dart';
import 'core/theme/mave_theme.dart';
import 'app/mave_app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MaveApp());
}

class MaveApp extends StatelessWidget {
  final bool initialProvisioned;

  const MaveApp({
    super.key,
    this.initialProvisioned = false,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MAVE · Sovereign Autonomous Operating Layer',
      debugShowCheckedModeBanner: false,
      theme: MaveTheme.darkTheme,
      home: MaveAppShell(initialProvisioned: initialProvisioned),
    );
  }
}
