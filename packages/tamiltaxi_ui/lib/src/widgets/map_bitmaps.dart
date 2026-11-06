import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// Renders [child] off screen at [size] logical px × [pixelRatio] and returns PNG bytes.
/// Used to turn the Tamil Taxi marker widgets into Google Maps marker bitmaps.
Future<Uint8List> renderWidgetToPng(
  Widget child, {
  required Size size,
  required double pixelRatio,
  required ui.FlutterView view,
}) async {
  final image = await _renderImage(child, size: size, pixelRatio: pixelRatio, view: view);
  try {
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return bytes!.buffer.asUint8List();
  } finally {
    image.dispose();
  }
}

/// Like [renderWidgetToPng], cropped to the pixels [child] paints and widened to keep [keep] (logical px of [size])
/// inside, so a marker drawn from it covers, and takes taps on, only its visible part rather than the whole box it was
/// laid out in. [bounds] is the crop in logical px of [size]; all of it when nothing was painted.
Future<({Uint8List png, Rect bounds})> renderWidgetToTrimmedPng(
  Widget child, {
  required Size size,
  required double pixelRatio,
  required ui.FlutterView view,
  Offset? keep,
}) async {
  final image = await _renderImage(child, size: size, pixelRatio: pixelRatio, view: view);
  try {
    final w = image.width, h = image.height;
    final rgba = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
    var left = w, top = h, right = -1, bottom = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (rgba.getUint8((y * w + x) * 4 + 3) > 4) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    var crop = right < 0
        ? Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble())
        : Rect.fromLTRB(left.toDouble(), top.toDouble(), right + 1.0, bottom + 1.0);
    if (keep != null) {
      final k = keep * pixelRatio;
      crop = crop.expandToInclude(Rect.fromLTWH(k.dx.floorToDouble(), k.dy.floorToDouble(), 1, 1));
    }
    crop = crop.intersect(Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()));
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawImageRect(image, crop, Offset.zero & crop.size, Paint());
    final picture = recorder.endRecording();
    final cropped = await picture.toImage(crop.width.round(), crop.height.round());
    picture.dispose();
    try {
      final bytes = await cropped.toByteData(format: ui.ImageByteFormat.png);
      return (
        png: bytes!.buffer.asUint8List(),
        bounds: Rect.fromLTRB(
          crop.left / pixelRatio,
          crop.top / pixelRatio,
          crop.right / pixelRatio,
          crop.bottom / pixelRatio,
        ),
      );
    } finally {
      cropped.dispose();
    }
  } finally {
    image.dispose();
  }
}

Future<ui.Image> _renderImage(
  Widget child, {
  required Size size,
  required double pixelRatio,
  required ui.FlutterView view,
}) async {
  final boundary = RenderRepaintBoundary();
  final renderView = RenderView(
    view: view,
    child: RenderPositionedBox(alignment: Alignment.center, child: boundary),
    configuration: ViewConfiguration(
      logicalConstraints: BoxConstraints.tight(size),
      physicalConstraints: BoxConstraints.tight(size * pixelRatio),
      devicePixelRatio: pixelRatio,
    ),
  );
  final pipelineOwner = PipelineOwner()..rootNode = renderView;
  renderView.prepareInitialFrame();
  final buildOwner = BuildOwner(focusManager: FocusManager());
  try {
    final root = RenderObjectToWidgetAdapter<RenderBox>(
      container: boundary,
      child: MediaQuery(
        data: MediaQueryData(size: size, devicePixelRatio: pixelRatio),
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: SizedBox.fromSize(size: size, child: child),
          ),
        ),
      ),
    ).attachToRenderTree(buildOwner);
    buildOwner
      ..buildScope(root)
      ..finalizeTree();
    pipelineOwner
      ..flushLayout()
      ..flushCompositingBits()
      ..flushPaint();
    return await boundary.toImage(pixelRatio: pixelRatio);
  } finally {
    buildOwner.focusManager.dispose();
  }
}
