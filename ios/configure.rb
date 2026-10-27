#!/usr/bin/env ruby
# Wires the Live Activity into the Capacitor-generated Xcode project:
# adds the app-local plugin sources, the RestActivity widget extension,
# embeds it in the app, and saves a shared "App" scheme for xcodebuild.
# Idempotent; run from the repo root after `npx cap add ios`:
#   gem install xcodeproj && ruby ios/configure.rb
require "xcodeproj"

MIN_IOS = "16.2" # ActivityKit's ActivityContent / end(_:dismissalPolicy:)
BUNDLE_ID = "com.langstonw430.gymtracker"
ROOT = File.expand_path("App", __dir__)
project = Xcodeproj::Project.open(File.join(ROOT, "App.xcodeproj"))
app = project.targets.find { |t| t.name == "App" } or abort "App target not found"

def ensure_group(parent, name)
  parent[name] || parent.new_group(name, name)
end

def ensure_file(group, name)
  group.files.find { |f| f.path == name } || group.new_file(name)
end

def ensure_in_target(target, ref)
  target.source_build_phase.files_references.include?(ref) || target.add_file_references([ref])
end

(project.build_configurations + app.build_configurations).each do |c|
  c.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = MIN_IOS
end

app_group = project.main_group["App"]
shared_group = ensure_group(project.main_group, "Shared")
ext_group = ensure_group(project.main_group, "RestActivity")

attrs = ensure_file(shared_group, "RestActivityAttributes.swift")
%w[LiveActivityPlugin.swift GymViewController.swift].each { |f| ensure_in_target(app, ensure_file(app_group, f)) }
ensure_in_target(app, attrs)

ext = project.targets.find { |t| t.name == "RestActivity" }
unless ext
  ext = project.new_target(:app_extension, "RestActivity", :ios, MIN_IOS)
  ext.build_configurations.each do |c|
    c.build_settings.merge!(
      "PRODUCT_BUNDLE_IDENTIFIER" => "#{BUNDLE_ID}.RestActivity",
      "INFOPLIST_FILE" => "RestActivity/Info.plist",
      "GENERATE_INFOPLIST_FILE" => "NO",
      "SWIFT_VERSION" => "5.0",
      "SKIP_INSTALL" => "YES",
      "CODE_SIGN_STYLE" => "Automatic",
      "TARGETED_DEVICE_FAMILY" => "1,2",
      "MARKETING_VERSION" => "1.0",
      "CURRENT_PROJECT_VERSION" => "1",
      "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME" => "AccentColor",
      "LD_RUNPATH_SEARCH_PATHS" => ["$(inherited)", "@executable_path/Frameworks", "@executable_path/../../Frameworks"],
    )
  end
  %w[RestActivityBundle.swift RestActivityWidget.swift].each { |f| ensure_in_target(ext, ensure_file(ext_group, f)) }
  ensure_file(ext_group, "Info.plist")
  ensure_in_target(ext, attrs)
  app.add_dependency(ext)
  embed = app.new_copy_files_build_phase("Embed Foundation Extensions")
  embed.symbol_dst_subfolder_spec = :plug_ins
  bf = embed.add_file_reference(ext.product_reference)
  bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
end

# Swift auto-links SwiftUI/WidgetKit/ActivityKit on import; explicit framework
# references would pin an SDK path that differs between Xcode versions.
ext.frameworks_build_phase.files.dup.each(&:remove_from_project)
project.files.dup.each { |f| f.remove_from_project if f.source_tree == "DEVELOPER_DIR" }

project.save

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.set_launch_target(app)
scheme.save_as(project.path, "App", true)
puts "configured #{project.path}"
