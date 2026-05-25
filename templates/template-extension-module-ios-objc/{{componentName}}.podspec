Pod::Spec.new do |s|
  s.name            = "{{componentName}}"
  s.version         = "0.1"
  s.summary         = "Lynx native extension"
  s.description     = "Lynx native extension"
  s.homepage        = "https://github.com/lynx-family/lepo"
  s.license         = "MIT"
  s.platforms       = { :ios => "10.0" }
  s.author          = "Lynx"
  s.source          = { :git => "git@code.byted.org:lynx/template-assembler.git" }

  s.source_files    = "**/*.{h,m,mm,swift}"
  s.dependency      "Lynx", "4.0.0-nightly.202605250621.39.g48546c5d"
end
