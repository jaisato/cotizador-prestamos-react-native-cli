source 'https://rubygems.org'

# You may use http://rbenv.org/ or https://rvm.io/ to install and use this version
# activesupport 7.2 needs Ruby 3.1 or later.
ruby ">= 3.1"

# Exclude problematic versions of cocoapods that cause build failures, and the
# xcodeproj release that broke React Native's CI (both as in the template).
gem 'cocoapods', '>= 1.13', '!= 1.15.0', '!= 1.15.1'
gem 'xcodeproj', '< 1.26.0'

# The template allows activesupport >= 6.1.7.5 and pins concurrent-ruby
# < 1.3.4, which left versions with known advisories in range: activesupport
# below 7.2.3.1 (GHSA-cg4j-q9v8-6v38, GHSA-89vf-4333-qx8v, GHSA-2j26-frm8-cmj9)
# and concurrent-ruby below 1.3.7 (GHSA-h8w8-99g7-qmvj, GHSA-wv3x-4vxv-whpp,
# GHSA-6wx8-w4f5-wwcr). The pin only protected activesupport < 7.1, which
# used Logger without requiring it; 7.2 requires it itself. cocoapods-core
# caps activesupport below 8.
gem 'activesupport', '>= 7.2.3.1', '< 8'
gem 'concurrent-ruby', '>= 1.3.7'

# Ruby 3.4.0 has removed some libraries from the standard library.
gem 'bigdecimal'
gem 'logger'
gem 'benchmark'
gem 'mutex_m'
gem 'nkf'
